/**
 * Builds MongoDB aggregation pipelines for relation includes
 */

import type { Document } from 'mongodb';
import type { CollectionDefinition, RelationTargets, AnyRelation, LookupRelation } from '../types/collection';
import type { IncludeConfig, NestedIncludeConfig } from '../types/include';

/**
 * Builds aggregation pipeline stages for including relations via $lookup
 */
export class RelationPipelineBuilder {
  /**
   * Build aggregation pipeline stages for include config
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
    nestedConfig?: NestedIncludeConfig<any>,
  ): Document[] {
    const stages: Document[] = [];

    if (relation.type === 'lookup') {
      const lookupRelation = relation as LookupRelation;

      // Build the lookup pipeline
      const pipeline: Document[] = [];

      // Add nested includes if present
      if (nestedConfig?.include) {
        // We need to get the target collection definition to build nested lookups
        // For now, we'll just add a TODO marker
        // This will be resolved in Phase 4 when we have access to all collection definitions
        // pipeline.push(...this.buildNestedLookups(nestedConfig.include));
      }

      // Add where filter if present
      if (nestedConfig?.where) {
        pipeline.push({ $match: nestedConfig.where });
      }

      // Add sort if present
      if (nestedConfig?.sort) {
        pipeline.push({ $sort: nestedConfig.sort });
      }

      // Add limit if present
      if (nestedConfig?.limit) {
        pipeline.push({ $limit: nestedConfig.limit });
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
   * Build nested lookup stages recursively
   * This requires access to all collection definitions
   */
  static buildNestedPipeline<TRelationTargets extends RelationTargets>(
    targetCollectionDef: CollectionDefinition<any, TRelationTargets>,
    nestedInclude: IncludeConfig<TRelationTargets>,
  ): Document[] {
    // Recursively build pipeline for nested includes
    return this.buildPipeline(targetCollectionDef, nestedInclude);
  }
}
