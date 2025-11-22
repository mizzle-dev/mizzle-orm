/**
 * Builds MongoDB aggregation pipelines for relation includes
 */

import type { Document } from 'mongodb';
import type { CollectionDefinition, RelationTargets, AnyRelation, LookupRelation, FieldSelection } from '../types/collection';
import type { IncludeConfig, NestedIncludeConfig } from '../types/include';

/**
 * Builds aggregation pipeline stages for including relations via $lookup
 */
export class RelationPipelineBuilder {
  /**
   * Build aggregation pipeline stages for include config
   *
   * @param collectionDef - Collection definition
   * @param include - Include configuration
   */
  static buildPipeline<TRelationTargets extends RelationTargets>(
    collectionDef: CollectionDefinition<any, TRelationTargets>,
    include: IncludeConfig<TRelationTargets>,
  ): Document[] {
    const stages: Document[] = [];
    const relations = collectionDef._meta.relations;

    if (typeof include === 'string') {
      // Single relation: 'authorData'
      const relation = relations[include];
      if (!relation) {
        throw new Error(`Relation '${include}' not found`);
      }
      stages.push(...this.buildLookupStages(include, relation, undefined));
    } else if (typeof include === 'object') {
      // Multiple relations: { authorData: true, comments: true }
      for (const [relationName, config] of Object.entries(include)) {
        const relation = relations[relationName];
        if (!relation) {
          throw new Error(`Relation '${relationName}' not found`);
        }

        const nestedConfig = config === true ? undefined : (config as NestedIncludeConfig<any>);
        stages.push(...this.buildLookupStages(relationName, relation, nestedConfig));
      }
    }

    return stages;
  }

  /**
   * Build $lookup stages for a single relation
   */
  private static buildLookupStages(
    relationName: string,
    relation: AnyRelation,
    queryConfig?: NestedIncludeConfig<any>,
  ): Document[] {
    const stages: Document[] = [];

    if (relation.type === 'lookup') {
      const lookupRelation = relation as LookupRelation;

      // Build the lookup pipeline
      const pipeline: Document[] = [];

      // STEP 1: Merge where clauses (default AND query-time)
      const whereClause = this.mergeWhereClause(
        lookupRelation.where, // Default from relation
        queryConfig?.where,    // Query-time override
      );

      if (whereClause) {
        pipeline.push({ $match: whereClause });
      }

      // STEP 2: Sort (query-time replaces default)
      const sortClause = queryConfig?.sort ?? lookupRelation.sort;
      if (sortClause) {
        pipeline.push({ $sort: sortClause });
      }

      // STEP 3: Limit (query-time replaces default)
      const limitValue = queryConfig?.limit ?? lookupRelation.limit;
      if (limitValue) {
        pipeline.push({ $limit: limitValue });
      }

      // STEP 4: Field selection (query-time replaces default)
      const selectFields = queryConfig?.select ?? lookupRelation.select;
      if (selectFields) {
        const projection = this.buildProjection(selectFields);
        pipeline.push({ $project: projection });
      }

      // STEP 5: Nested includes (recursively build pipeline)
      if (queryConfig?.include && lookupRelation._targetCollectionDef) {
        const targetCollection = lookupRelation._targetCollectionDef;
        const nestedStages = this.buildPipeline(
          targetCollection,
          queryConfig.include,
        );
        pipeline.push(...nestedStages);
      }

      // Build the $lookup stage
      const lookupStage: Document = {
        $lookup: {
          from: lookupRelation.targetCollection,
          localField: lookupRelation.localField,
          foreignField: lookupRelation.foreignField,
          as: relationName,
        },
      };

      // Add pipeline if we have any stages
      if (pipeline.length > 0) {
        lookupStage.$lookup.pipeline = pipeline;
      }

      stages.push(lookupStage);

      // If `one: true`, unwind to single document (or null)
      if (lookupRelation.one) {
        stages.push({
          $unwind: {
            path: `$${relationName}`,
            preserveNullAndEmptyArrays: true,
          },
        });
      }
    } else if (relation.type === 'reference') {
      // Reference relations are similar to lookups
      // For now, we'll build a lookup stage for validation
      const lookupStage: Document = {
        $lookup: {
          from: relation.targetCollection,
          localField: relation.localField,
          foreignField: relation.foreignField,
          as: relationName,
        },
      };

      stages.push(lookupStage);

      // Unwind to single document
      stages.push({
        $unwind: {
          path: `$${relationName}`,
          preserveNullAndEmptyArrays: true,
        },
      });
    } else if (relation.type === 'embed') {
      // Embed relations are denormalized, no lookup needed
      // Skip for now
    }

    return stages;
  }


  /**
   * Build MongoDB projection from FieldSelection
   * Handles both array syntax and MongoDB projection syntax
   */
  private static buildProjection(select: FieldSelection): Record<string, 1 | 0> {
    if (Array.isArray(select)) {
      // Array syntax: ['name', 'email', 'profile.avatar']
      const projection: Record<string, 1> = { _id: 1 }; // Always include _id
      for (const field of select) {
        projection[field] = 1;
      }
      return projection;
    } else {
      // MongoDB projection syntax: { name: 1, email: 1, password: 0 }
      const projection: Record<string, 1 | 0> = {};

      // Always include _id unless explicitly excluded
      if (select._id !== 0) {
        projection._id = 1;
      }

      // Copy all field specifications
      for (const [field, include] of Object.entries(select)) {
        projection[field] = include;
      }

      return projection;
    }
  }

  /**
   * Merge where clauses (AND together)
   * Default where clause is ANDed with query-time where clause
   */
  private static mergeWhereClause(
    defaultWhere: any,
    queryWhere: any,
  ): any | undefined {
    if (!defaultWhere && !queryWhere) return undefined;
    if (!defaultWhere) return queryWhere;
    if (!queryWhere) return defaultWhere;

    // Both exist - AND them together
    return {
      $and: [defaultWhere, queryWhere],
    };
  }
}
