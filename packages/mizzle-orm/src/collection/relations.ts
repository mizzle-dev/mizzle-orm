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
} from '../types/collection';
import { RelationType } from '../types/collection';
import type { SchemaDefinition } from '../types/field';

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
  config: Omit<ReferenceRelation, 'type' | 'targetCollection'>,
): TypedRelation<ReferenceRelation, CollectionDefinition<TOther, TTargets>> {
  return {
    type: RelationType.REFERENCE,
    targetCollection: targetCollection._meta.name,
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
export function lookup<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
  targetCollection: CollectionDefinition<TOther, TTargets>,
  config: Omit<LookupRelation, 'type' | 'targetCollection'>,
): TypedRelation<LookupRelation, CollectionDefinition<TOther, TTargets>> {
  return {
    type: RelationType.LOOKUP,
    targetCollection: targetCollection._meta.name,
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
export function embed<
  TOther extends SchemaDefinition,
  TTargets extends RelationTargets,
  const TConfig, // const forces literal type preservation
>(
  sourceCollection: CollectionDefinition<TOther, TTargets>,
  config: TConfig,
): TypedRelation<EmbedRelation<any, any>, CollectionDefinition<TOther, TTargets>, TConfig> {
  return {
    type: RelationType.EMBED,
    sourceCollection: sourceCollection._meta.name,
    ...config,
  } as any;
}
