/**
 * Relation handling for collections
 */

import type { Db, Document, ObjectId } from 'mongodb';
import type { OrmContext } from '../types/orm';
import type {
  ReferenceRelation,
  EmbedRelation,
  LookupRelation,
  CollectionDefinition,
} from '../types/collection';
import type { SchemaDefinition } from '../types/field';

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
}
