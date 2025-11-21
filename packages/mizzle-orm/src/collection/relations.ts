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
 * Define an EMBED relation - denormalized data fetched separately
 *
 * @example
 * ```typescript
 * const users = mongoCollection('users', {
 *   favoritePostIds: array(objectId()),
 * }, {
 *   relations: {
 *     favoritePosts: embed(posts, {
 *       extractIds: (user) => user.favoritePostIds,
 *       applyEmbeds: (user, posts) => ({ ...user, favoritePosts: posts }),
 *     })
 *   }
 * });
 * ```
 */
export function embed<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
  sourceCollection: CollectionDefinition<TOther, TTargets>,
  config: Omit<EmbedRelation, 'type' | 'sourceCollection'>,
): TypedRelation<EmbedRelation, CollectionDefinition<TOther, TTargets>> {
  return {
    type: RelationType.EMBED,
    sourceCollection: sourceCollection._meta.name,
    ...config,
  } as any;
}
