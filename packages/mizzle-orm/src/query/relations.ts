/**
 * Relation handling for collections
 */

import { ObjectId as MongoObjectId, type Db, type Document, type ObjectId } from 'mongodb';
import type { OrmContext } from '../types/orm';
import type {
  ReferenceRelation,
  EmbedRelation,
  LookupRelation,
  CollectionDefinition,
  ForwardEmbedConfig,
} from '../types/collection';
import type { SchemaDefinition } from '../types/field';
import { PathNavigator } from '../utils/path-navigator';

/**
 * Populate a LOOKUP relation
 */
export async function populateLookup<TDoc extends Document>(
  db: Db,
  docs: TDoc[],
  relation: LookupRelation,
  as: string,
): Promise<TDoc[]> {
  if (docs.length === 0) return docs;

  // Extract local field values
  const localValues = docs
    .map((doc) => doc[relation.localField])
    .filter((v) => v != null);

  if (localValues.length === 0) return docs;

  // Convert to ObjectId if the foreign field is _id and we have strings
  const { ObjectId } = await import('mongodb');
  const shouldConvertToObjectId = relation.foreignField === '_id';

  const lookupValues = shouldConvertToObjectId
    ? localValues.map((v) => (v instanceof ObjectId ? v : new ObjectId(String(v))))
    : localValues;

  // Fetch related documents
  const relatedDocs = await db
    .collection(relation.targetCollection)
    .find({
      [relation.foreignField]: { $in: lookupValues },
    })
    .toArray();

  // Create lookup map
  const lookupMap = new Map<string, Document[]>();
  for (const relatedDoc of relatedDocs) {
    const key = String(relatedDoc[relation.foreignField]);
    if (!lookupMap.has(key)) {
      lookupMap.set(key, []);
    }
    lookupMap.get(key)!.push(relatedDoc);
  }

  // Populate documents
  return docs.map((doc) => {
    const localValue = doc[relation.localField];
    if (localValue == null) return doc;

    const related = lookupMap.get(String(localValue)) || [];
    return {
      ...doc,
      [as]: relation.one ? related[0] || null : related,
    } as TDoc;
  });
}

/**
 * Validate a REFERENCE relation
 */
export async function validateReference(
  db: Db,
  relation: ReferenceRelation,
  value: ObjectId | string | null | undefined,
): Promise<boolean> {
  if (value == null) return true;

  // Convert to ObjectId if the foreign field is _id and value is a string
  // For other fields (like public IDs), keep as string
  const { ObjectId } = await import('mongodb');
  const shouldConvertToObjectId = relation.foreignField === '_id';
  const lookupValue =
    shouldConvertToObjectId && typeof value === 'string'
      ? new ObjectId(value)
      : value;

  const exists = await db
    .collection(relation.targetCollection)
    .findOne({
      [relation.foreignField]: lookupValue,
    });

  return exists !== null;
}

/**
 * Embed related documents
 */
export async function embedRelation<TDoc extends Document>(
  db: Db,
  docs: TDoc[],
  relation: EmbedRelation,
  as: string,
): Promise<TDoc[]> {
  if (docs.length === 0 || !relation.extractIds) return docs;

  // Extract IDs from all documents
  const allIds = docs.flatMap((doc) => relation.extractIds!(doc)).filter((id) => id != null);

  if (allIds.length === 0) return docs;

  // Convert string IDs to ObjectIds if needed
  const { ObjectId } = await import('mongodb');
  const objectIds = allIds.map((id) => (typeof id === 'string' ? new ObjectId(id) : id));

  // Fetch related documents
  const relatedDocs = await db
    .collection(relation.sourceCollection)
    .find({
      _id: { $in: objectIds as any },
    })
    .toArray();

  // Create map for lookup
  const relatedMap = new Map<string, Document>();
  for (const doc of relatedDocs) {
    relatedMap.set(String(doc._id), doc);
  }

  // Embed documents
  return docs.map((doc) => {
    const ids = relation.extractIds!(doc);
    const embedded = ids.map((id) => relatedMap.get(id)).filter((d) => d != null);

    return {
      ...doc,
      [as]: embedded,
    } as TDoc;
  });
}

/**
 * Relation helper - provides convenient methods for working with relations
 */
export class RelationHelper<TDoc extends Document> {
  constructor(
    private db: Db,
    private collectionDef: CollectionDefinition<SchemaDefinition>,
    _ctx: OrmContext,
  ) {}

  /**
   * Populate one or more LOOKUP relations
   */
  async populate(
    docs: TDoc[],
    relationName: string | string[],
  ): Promise<TDoc[]> {
    const relationNames = Array.isArray(relationName) ? relationName : [relationName];
    let result = docs;

    for (const name of relationNames) {
      const relation = this.collectionDef._meta.relations?.[name];
      if (!relation) {
        throw new Error(`Relation '${name}' not found on collection`);
      }

      if (relation.type === 'lookup') {
        result = await populateLookup(this.db, result, relation, name);
      } else if (relation.type === 'embed') {
        result = await embedRelation(this.db, result, relation, name);
      }
      // REFERENCE relations don't need population (they're just foreign keys)
    }

    return result;
  }

  /**
   * Validate REFERENCE relations before insert/update
   */
  async validateReferences(doc: Partial<TDoc>): Promise<void> {
    const relations = this.collectionDef._meta.relations || {};

    for (const [_name, relation] of Object.entries(relations)) {
      if (relation.type === 'reference') {
        const value = (doc as any)[relation.localField];
        if (value !== undefined) {
          const isValid = await validateReference(this.db, relation, value);
          if (!isValid) {
            throw new Error(
              `Invalid reference: ${relation.localField} references non-existent document in ${relation.targetCollection}`
            );
          }
        }
      }
    }
  }

  /**
   * Process forward embeds for a document
   * Fetches and embeds referenced data into the document
   * @param doc - The document to process
   * @param onlyRelations - Optional array of relation names to process (processes all if not specified)
   */
  async processForwardEmbeds(doc: Partial<TDoc>, onlyRelations?: string[]): Promise<Partial<TDoc>> {
    const relations = this.collectionDef._meta.relations || {};
    let result = { ...doc };

    for (const [relationName, relation] of Object.entries(relations)) {
      if (relation.type !== 'embed') continue;

      // Skip if onlyRelations is specified and this relation is not in the list
      if (onlyRelations && !onlyRelations.includes(relationName)) continue;

      // New forward embed config
      if (relation.forward) {
        result = await this.processForwardEmbed(
          result,
          relationName,
          relation.forward,
          relation.sourceCollection,
        );
      }
    }

    return result;
  }

  /**
   * Process a single forward embed relation
   */
  private async processForwardEmbed(
    doc: Partial<TDoc>,
    relationName: string,
    config: ForwardEmbedConfig,
    sourceCollectionName: string,
  ): Promise<Partial<TDoc>> {
    // Extract IDs from document
    const ids = PathNavigator.extractIds(doc as Document, config);
    if (ids.length === 0) return doc;

    // Determine which field to use for lookup
    const embedIdField = config.embedIdField || '_id';
    const lookupField = embedIdField; // Field to search by in source collection

    // Fetch source documents by the appropriate ID field
    // If embedIdField is '_id', try to convert strings to ObjectIds
    // Otherwise, keep as strings (e.g., for publicId fields)
    const lookupValues =
      lookupField === '_id'
        ? ids.map((id) => {
            try {
              return new MongoObjectId(id);
            } catch {
              return id as any;
            }
          })
        : ids; // Keep as strings for non-_id fields

    const sourceDocs = await this.db
      .collection(sourceCollectionName)
      .find({ [lookupField]: { $in: lookupValues } })
      .toArray();

    if (sourceDocs.length === 0) {
      // No source documents found - log warning but continue
      console.warn(
        `Forward embed '${relationName}': No source documents found for IDs: ${ids.join(', ')}`
      );
      return doc;
    }

    // Build embed map (ID → embedded fields)
    // Map by the field value that was extracted from the document
    const embedMap = new Map<string, Document>();

    for (const sourceDoc of sourceDocs) {
      const embedded = this.extractFields(sourceDoc, config.fields, embedIdField);
      // Map by the lookup field value (converted to string)
      const lookupValue = sourceDoc[lookupField];
      const sourceId =
        lookupValue instanceof MongoObjectId ? lookupValue.toHexString() : String(lookupValue);
      embedMap.set(sourceId, embedded);
    }

    // Apply embeds to document
    const result = PathNavigator.applyEmbeds(
      doc as Document,
      config,
      embedMap,
      relationName,
    );

    return result as Partial<TDoc>;
  }

  /**
   * Extract specified fields from document
   * ALWAYS includes the ID field from embedIdField config
   */
  private extractFields(
    doc: Document,
    fields: string[] | Record<string, 1 | 0>,
    embedIdField: string = '_id',
  ): Document {
    if (Array.isArray(fields)) {
      const result: Document = {};

      // Always include the ID field first (convert to string)
      if (embedIdField in doc) {
        const idValue = doc[embedIdField];
        result._id = idValue instanceof MongoObjectId ? idValue.toHexString() : String(idValue);
      }

      for (const field of fields) {
        if (field in doc && field !== embedIdField) {
          result[field] = doc[field];
        }
      }
      return result;
    } else {
      // Projection syntax
      const result: Document = {};

      // Always include the ID field unless explicitly excluded (convert to string)
      if (fields._id !== 0 && embedIdField in doc) {
        const idValue = doc[embedIdField];
        result._id = idValue instanceof MongoObjectId ? idValue.toHexString() : String(idValue);
      }

      for (const [field, include] of Object.entries(fields)) {
        if (include === 1 && field in doc && field !== embedIdField) {
          result[field] = doc[field];
        }
      }
      return result;
    }
  }
}
