/**
 * Type inference utilities for relations and populate operations
 */

import type { RelationTargets } from './collection';
import type { InferDocument } from './inference';

/**
 * Add a single populated relation field to a document type
 *
 * Note: This assumes all populated fields are arrays of the target document type.
 * Users who use `one: true` in their lookup config will get `TDoc[]` but can assert
 * to `TDoc | null` if needed. This is a pragmatic trade-off for DX.
 *
 * @template TDoc - The base document type
 * @template TRelationName - The name of the relation field to populate
 * @template TRelationTargets - Map of all relation names to their target collections
 */
export type WithPopulated<
  TDoc,
  TRelationName extends keyof TRelationTargets & string,
  TRelationTargets extends RelationTargets,
> = TRelationName extends keyof TRelationTargets
  ? TDoc & {
      [K in TRelationName]: InferDocument<TRelationTargets[TRelationName]> | null;
    }
  : TDoc;

/**
 * Add multiple populated fields to a document type
 * Each relation name in the array will be added as a populated field
 */
export type WithPopulatedMany<
  TDoc,
  TRelationNames extends Array<keyof TRelationTargets & string>,
  TRelationTargets extends RelationTargets,
> = TRelationNames extends [infer First extends keyof TRelationTargets & string, ...infer Rest]
  ? Rest extends Array<keyof TRelationTargets & string>
    ? WithPopulatedMany<WithPopulated<TDoc, First, TRelationTargets>, Rest, TRelationTargets>
    : WithPopulated<TDoc, First, TRelationTargets>
  : TDoc;
