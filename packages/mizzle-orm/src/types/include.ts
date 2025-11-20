/**
 * Type utilities for relation includes
 */

import type { CollectionDefinition, RelationTargets } from './collection';
import type { InferDocument } from './inference';

/**
 * Configuration for nested includes on a related collection
 */
export type NestedIncludeConfig<TTarget extends CollectionDefinition<any, any>> =
  TTarget extends CollectionDefinition<any, infer TNestedRelations>
    ? {
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
 */
type AddPopulatedField<
  TDoc,
  TRelationName extends string,
  TTarget extends CollectionDefinition<any, any>,
  TConfig,
> = TConfig extends NestedIncludeConfig<TTarget>
  ? TTarget extends CollectionDefinition<any, infer TNestedRelations>
    ? TDoc & {
        [K in TRelationName]: TConfig['include'] extends IncludeConfig<TNestedRelations>
          ? WithIncluded<InferDocument<TTarget>, TConfig['include'], TNestedRelations>
          : InferDocument<TTarget>;
      }
    : TDoc & {
        [K in TRelationName]: InferDocument<TTarget>;
      }
  : TDoc & {
      [K in TRelationName]: InferDocument<TTarget> | null;
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
      {
        [K in keyof TInclude]: K extends keyof TRelationTargets
          ? TInclude[K] extends true | NestedIncludeConfig<TRelationTargets[K]>
            ? true
            : never
          : never;
      } extends Record<keyof TInclude, true>
      ? // All keys are valid relations
        UnionToIntersection<
          {
            [K in keyof TInclude]: K extends keyof TRelationTargets
              ? AddPopulatedField<{}, K & string, TRelationTargets[K], TInclude[K]>
              : {};
          }[keyof TInclude]
        > &
          TDoc
      : TDoc
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
