/**
 * Type utilities for relation includes
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
 * Apply field selection to a document type
 * Supports array syntax: ['name', 'email']
 * For now, projection syntax ({ name: 1, email: 1 }) returns the full document
 * (More sophisticated projection type inference can be added later)
 */
type ApplyFieldSelection<TDoc, TSelect> = TSelect extends Array<infer K>
  ? K extends keyof TDoc
    ? Pick<TDoc, K>
    : TDoc
  : TDoc; // Projection syntax: return full doc for now

/**
 * Configuration for nested includes on a related collection
 * Can accept either a CollectionDefinition directly or extract from TypedRelation
 */
export type NestedIncludeConfig<TTargetOrRelation> =
  ExtractTarget<TTargetOrRelation> extends CollectionDefinition<any, infer TNestedRelations>
    ? {
        select?: string[] | Record<string, any>; // More permissive - array or any object with field specs
        include?: IncludeConfig<TNestedRelations>;
        where?: Record<string, any>;
        sort?: Record<string, 1 | -1>;
        limit?: number;
      }
    : TTargetOrRelation extends CollectionDefinition<any, infer TNestedRelations>
      ? {
          select?: string[] | Record<string, any>; // More permissive
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
 * Handles both field selection and nested includes
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
          ? InferDocument<CollectionDefinition<TSchema, TNestedRelations>> | null
          : TConfig extends { include: any; select: any }
            ? WithIncluded<
                ApplyFieldSelection<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['select']>,
                TConfig['include'],
                TNestedRelations
              >
            : TConfig extends { include: any }
              ? WithIncluded<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['include'], TNestedRelations>
              : TConfig extends { select: any }
                ? ApplyFieldSelection<InferDocument<CollectionDefinition<TSchema, TNestedRelations>>, TConfig['select']>
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
