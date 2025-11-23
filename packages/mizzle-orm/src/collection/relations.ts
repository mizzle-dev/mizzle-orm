/**
 * Relation factory functions for defining collection relationships
 */

import type {
  CollectionDefinition,
  ReferenceRelation,
  EmbedRelation,
  LookupRelation,
  TypedRelation,
  RelationTargets,
  EmbedConfig,
} from '../types/collection';
import { RelationType } from '../types/collection';
import type { SchemaDefinition } from '../types/field';
import type { InferDocument } from '../types/inference';

/**
 * Define a REFERENCE relation - validates foreign key exists
 *
 * @example
 * ```typescript
 * const posts = mongoCollection('posts', {
 *   authorId: objectId(),
 * }, {
 *   relations: {
 *     author: reference(users, {
 *       localField: 'authorId',
 *       foreignField: '_id',
 *     })
 *   }
 * });
 * ```
 */
export function reference<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
  targetCollection: CollectionDefinition<TOther, TTargets>,
  config: Omit<ReferenceRelation, 'type' | 'targetCollection' | '_targetCollectionDef'>,
): TypedRelation<ReferenceRelation, CollectionDefinition<TOther, TTargets>> {
  return {
    type: RelationType.REFERENCE,
    targetCollection: targetCollection._meta.name,
    _targetCollectionDef: targetCollection, // Store full collection definition for runtime
    ...config,
  } as any;
}

/**
 * Define a LOOKUP relation - populates related documents via $lookup
 *
 * @example
 * ```typescript
 * const posts = mongoCollection('posts', {
 *   authorId: objectId(),
 * }, {
 *   relations: {
 *     author: lookup(users, {
 *       localField: 'authorId',
 *       foreignField: '_id',
 *       one: true, // Returns single document
 *     })
 *   }
 * });
 * ```
 */
export function lookup<
  TOther extends SchemaDefinition,
  TTargets extends RelationTargets,
  const TConfig extends Omit<LookupRelation, 'type' | 'targetCollection' | '_targetCollectionDef'>,
>(
  targetCollection: CollectionDefinition<TOther, TTargets>,
  config: TConfig,
): TypedRelation<LookupRelation, CollectionDefinition<TOther, TTargets>, TConfig> {
  return {
    type: RelationType.LOOKUP,
    targetCollection: targetCollection._meta.name,
    _targetCollectionDef: targetCollection, // Store full collection definition for runtime
    ...config,
  } as any;
}

/**
 * Define an EMBED relation - write-time denormalization for read performance
 *
 * When documents are saved, referenced data is fetched and stored alongside
 * the reference, eliminating the need for lookups on read.
 *
 * @example
 * ```typescript
 * // Simple embed
 * const posts = mongoCollection('posts', {
 *   authorId: string(),
 * }, {
 *   relations: {
 *     author: embed(authors, {
 *       forward: {
 *         from: 'authorId',
 *         fields: ['name', 'email', 'avatar'],
 *       },
 *       keepFresh: true, // Auto-update when author changes
 *     })
 *   }
 * });
 *
 * // Array embed
 * const posts = mongoCollection('posts', {
 *   tagIds: array(string()),
 * }, {
 *   relations: {
 *     tags: embed(tags, {
 *       forward: {
 *         from: 'tagIds',
 *         fields: ['name', 'color'],
 *       }
 *     })
 *   }
 * });
 *
 * // In-place embed (merge into existing object)
 * const workflows = mongoCollection('workflows', {
 *   workflow: object({
 *     refDirectory: object({
 *       _id: string(),
 *       name: string().optional(),
 *     }),
 *   }),
 * }, {
 *   relations: {
 *     directory: embed(directories, {
 *       forward: {
 *         from: 'workflow.refDirectory._id', // ._id → inplace strategy
 *         fields: ['name', 'type'],
 *       }
 *     })
 *   }
 * });
 * ```
 */

/**
 * Helper to check for excess properties in embed config
 * Returns an error type if invalid keys are found
 */
type ValidateEmbedConfig<T, TTargetDoc> = T extends EmbedConfig<any, any, TTargetDoc>
  ? Exclude<keyof T, keyof EmbedConfig> extends never
    ? T
    : { error: 'Invalid property in embed config'; invalidKeys: Exclude<keyof T, keyof EmbedConfig> }
  : { error: 'Config must be an EmbedConfig' };

export function embed<
  TOther extends SchemaDefinition,
  TTargets extends RelationTargets,
  const TConfig extends EmbedConfig<string, readonly string[], InferDocument<CollectionDefinition<TOther, TTargets>>>, // const forces literal type preservation
>(
  sourceCollection: CollectionDefinition<TOther, TTargets>,
  config: TConfig & ValidateEmbedConfig<TConfig, InferDocument<CollectionDefinition<TOther, TTargets>>>,
): TypedRelation<EmbedRelation<string, readonly string[], InferDocument<CollectionDefinition<TOther, TTargets>>>, CollectionDefinition<TOther, TTargets>, TConfig> {
  return {
    type: RelationType.EMBED,
    sourceCollection: sourceCollection._meta.name,
    _sourceCollectionDef: sourceCollection, // Store full collection definition for runtime
    ...config,
  } as any;
}
