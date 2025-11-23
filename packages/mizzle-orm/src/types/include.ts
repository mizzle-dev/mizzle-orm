/**
 * Type utilities for relation includes
 *
 * PERFORMANCE NOTE:
 * These types use recursive conditional extraction for perfect type inference.
 * For very large schemas (200+ collections) or deep nesting (10+ levels),
 * TypeScript compilation may be slow. Consider:
 * - Splitting schemas into modules
 * - Limiting include depth in tsconfig: "noUncheckedIndexedAccess": true
 * - Using type assertions for extreme edge cases
 */

import type { CollectionDefinition, RelationTargets } from './collection';
import type { InferDocument } from './inference';

/**
 * Extract the target CollectionDefinition from a TypedRelation
 * Preserves the full type including schema
 */
type ExtractTarget<TRelation> = TRelation extends { _targetCollection?: infer T }
  ? T
  : never;

/**
 * Extract the _id type from a document
 */
type ExtractIdType<TDoc> = TDoc extends { _id: infer TId } ? TId : any;

/**
 * Apply field projection to a document type
 * Supports MongoDB projection syntax:
 * - Projection inclusion: { name: 1, email: 1 } - includes fields marked with 1/true
 * - Projection exclusion: { password: 0 } - all fields except those marked 0/false
 *
 * Note: MongoDB always includes _id unless explicitly excluded with _id: 0
 * Nested paths like 'profile.avatar' work at runtime but have limited type safety
 */
type ApplyFieldSelection<TDoc, TSelect> = TSelect extends Record<string, any>
  ? // MongoDB projection syntax: { name: 1, email: 1, password: 0 }
    {
      // Include fields marked with 1 or true
      [K in keyof TDoc as K extends keyof TSelect
        ? TSelect[K] extends 0 | false
          ? never
          : K
        : never]: TDoc[K];
    } & {
      // Always include _id unless explicitly excluded with _id: 0
      _id: '_id' extends keyof TSelect
        ? TSelect['_id'] extends 0 | false
          ? never
          : ExtractIdType<TDoc>
        : ExtractIdType<TDoc>;
    }
  : TDoc; // No projection specified: return full document

/**
 * Extract default projection from a relation definition
 * Checks both the relation config (from _relConfig phantom type) and the relation itself
 */
type ExtractDefaultProjection<TRel> = TRel extends { _relConfig?: infer TConfig }
  ? TConfig extends { projection?: infer TProj }
    ? TProj
    : TRel extends { projection?: infer TProj }
      ? TProj
      : never
  : TRel extends { projection?: infer TProj }
    ? TProj
    : never;

/**
 * Configuration for nested includes on a related collection
 * Can accept either a CollectionDefinition directly or extract from TypedRelation
 */
export type NestedIncludeConfig<TTargetOrRelation> =
  ExtractTarget<TTargetOrRelation> extends CollectionDefinition<any, infer TNestedRelations>
    ? {
        projection?: Record<string, any>;
        include?: IncludeConfig<TNestedRelations>;
        where?: Record<string, any>;
        sort?: Record<string, 1 | -1>;
        limit?: number;
      }
    : TTargetOrRelation extends CollectionDefinition<any, infer TNestedRelations>
      ? {
          projection?: Record<string, any>;
          include?: IncludeConfig<TNestedRelations>;
          where?: Record<string, any>;
          sort?: Record<string, 1 | -1>;
          limit?: number;
        }
      : never;

/**
 * Include configuration for a collection
 * Supports:
 * - String: 'authorData' (single relation)
 * - Object: { authorData: true, comments: true }
 * - Nested: { authorData: { include: { organizationData: true } } }
 */
export type IncludeConfig<TRelationTargets extends RelationTargets> =
  | (keyof TRelationTargets & string)
  | {
      [K in keyof TRelationTargets]?:
        | true
        | NestedIncludeConfig<TRelationTargets[K]>;
    };

/**
 * Add a single populated relation field to a document type
 * Handles both field projection and nested includes
 * Applies default projection from relation definition when config is `true`
 */
type AddPopulatedField<
  TDoc,
  TRelationName extends string,
  TRelation,
  TConfig,
> = ExtractTarget<TRelation> extends CollectionDefinition<infer TSchema, infer TNestedRelations>
  ? TDoc & {
      [K in TRelationName]: (
        TConfig extends true
          ? // Check if relation has a default projection
            ExtractDefaultProjection<TRelation> extends infer TDefaultProj
            ? [TDefaultProj] extends [never]
              ? // No default projection, return full document
                InferDocument<CollectionDefinition<TSchema, TNestedRelations>> | null
              : // Apply default projection
                ApplyFieldSelection<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TDefaultProj> | null
            : InferDocument<CollectionDefinition<TSchema, TNestedRelations>> | null
          : TConfig extends { include: any; projection: any }
            ? WithIncluded<
                ApplyFieldSelection<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['projection']>,
                TConfig['include'],
                TNestedRelations
              >
            : TConfig extends { include: any }
              ? WithIncluded<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['include'], TNestedRelations>
              : TConfig extends { projection: any }
                ? ApplyFieldSelection<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['projection']>
                : InferDocument<CollectionDefinition<TSchema, TNestedRelations>> | null
      );
    }
  : TDoc & {
      [K in TRelationName]: any;
    };

/**
 * Transform a document type by adding populated relation fields
 * based on the include configuration
 */
export type WithIncluded<
  TDoc,
  TInclude,
  TRelationTargets extends RelationTargets,
> = TInclude extends keyof TRelationTargets & string
  ? // Single string: 'authorData'
    TInclude extends keyof TRelationTargets
    ? AddPopulatedField<TDoc, TInclude, TRelationTargets[TInclude], true>
    : TDoc
  : TInclude extends object
    ? // Object: { authorData: true, comments: true }
      UnionToIntersection<
        {
          [K in keyof TInclude]: K extends keyof TRelationTargets
            ? AddPopulatedField<{}, K & string, TRelationTargets[K], TInclude[K]>
            : {};
        }[keyof TInclude]
      > &
        TDoc
    : TDoc;

/**
 * Helper to convert union to intersection
 * e.g., { a: string } | { b: number } => { a: string } & { b: number }
 */
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;
