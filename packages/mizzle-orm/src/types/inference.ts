/**
 * Type inference utilities for extracting Document, Insert, and Update types from schemas
 */

import type { ObjectId } from 'mongodb';
import type { AnyFieldBuilder, SchemaDefinition, InferFieldBuilderType, FieldType } from './field';
import type { ArrayFieldBuilder } from './field';
import type { CollectionDefinition, TypedRelation, RelationType } from './collection';

/**
 * Infer the base TypeScript type from a field builder
 */
export type InferFieldType<T extends AnyFieldBuilder> = InferFieldBuilderType<T>;

/**
 * Extract schema from a CollectionDefinition or use SchemaDefinition directly
 */
export type ExtractSchemaOrUse<T> = T extends { _schema: infer S extends SchemaDefinition }
  ? S
  : T extends SchemaDefinition
    ? T
    : never;

/**
 * Helper to check if a field is an array type
 * Checks for:
 * 1. _item property (ArrayFieldBuilder instances)
 * 2. ArrayFieldBuilder type
 * 3. _config.type === 'array' (for .optional() wrapped arrays)
 */
type IsArrayField<TField> = TField extends { _item: any }
  ? true
  : TField extends ArrayFieldBuilder<any>
    ? true
    : TField extends { _config: { type: FieldType.ARRAY } }
      ? true
      : false;

/**
 * Helper to extract the 'from' path from embed config
 * Uses index access to preserve literal types
 */
type ExtractFromPath<TConfig> = TConfig extends { forward: { from: infer TFrom } }
  ? TFrom
  : TConfig extends { forward?: { from?: infer TFrom } }
    ? TFrom
    : never;

/**
 * Helper to infer cardinality of an embed based on config and parent schema
 */
type InferEmbedCardinality<
  TParentSchema extends SchemaDefinition,
  TConfig,
> = TConfig extends { forward: { paths: any[] } }
  ? 'many' // Multiple paths = array
  : TConfig extends { forward?: { paths?: any[] } }
    ? 'many' // Multiple paths = array
    : ExtractFromPath<TConfig> extends keyof TParentSchema
      ? IsArrayField<TParentSchema[ExtractFromPath<TConfig>]> extends true
        ? 'many' // Source field is array = array embed
        : 'one' // Source field is single = single embed
      : 'unknown'; // Can't determine

/**
 * Extract projection configuration from embed relation
 */
type ExtractEmbedProjection<TRel> = TRel extends { forward: { projection: infer TProj } }
  ? TProj
  : TRel extends { forward?: { projection?: infer TProj } }
    ? TProj
    : never;

/**
 * Apply field projection to embedded document type
 * Similar to ApplyFieldSelection but always converts _id to string
 */
type ApplyEmbedFieldProjection<TDoc, TProj> = TProj extends Record<string, any>
  ? // Projection syntax: { name: 1, email: 1 }
    {
      [K in keyof TDoc as K extends keyof TProj
        ? TProj[K] extends 0 | false
          ? never
          : K
        : never]: TDoc[K];
    } & {
      _id: '_id' extends keyof TProj
        ? TProj['_id'] extends 0 | false
          ? never
          : string
        : string;
    }
  : Partial<Omit<TDoc, '_id'>> & { _id: string };

/**
 * Helper to create embedded document type with field projection
 * @template TTarget - The target collection definition
 * @template TRel - The embed relation config containing projection
 */
type EmbeddedDocType<TTarget, TRel = never> = TTarget extends CollectionDefinition<any, any>
  ? [TRel] extends [never]
    ? // No relation config provided, return all fields
      Partial<Omit<InferDocument<TTarget>, '_id'>> & { _id: string }
    : // Apply field projection from relation config
      ExtractEmbedProjection<TRel> extends infer TProj
      ? [TProj] extends [never]
        ? // No projection specified, return all fields
          Partial<Omit<InferDocument<TTarget>, '_id'>> & { _id: string }
        : // Apply field projection
          ApplyEmbedFieldProjection<InferDocument<TTarget>, TProj>
      : never
  : never;

/**
 * Extract only EMBED relation keys (not LOOKUP or REFERENCE)
 */
type EmbedRelationKeys<TRelationTargets> = {
  [K in keyof TRelationTargets]: TRelationTargets[K] extends TypedRelation<
    infer TRel,
    any,
    any
  >
    ? TRel extends { type: RelationType.EMBED }
      ? K
      : never
    : never;
}[keyof TRelationTargets];

/**
 * Extract embedded fields from a collection's relations
 * For each EMBED relation, adds an optional field with the target document type
 * The embedded type includes _id: string plus any fields from the target
 * Now correctly infers single vs array based on source field type
 *
 * IMPORTANT: Only includes EMBED relations, not LOOKUP or REFERENCE.
 * LOOKUP relations are added dynamically via WithIncluded when using include option.
 */
type InferEmbeddedFields<T> = T extends CollectionDefinition<infer TSchema, infer TRelationTargets>
  ? {
      [K in EmbedRelationKeys<TRelationTargets>]?: TRelationTargets[K] extends TypedRelation<
        infer TRel,
        infer TTarget,
        infer TConfig
      >
        ? TRel extends { type: RelationType.EMBED }
          ? InferEmbedCardinality<TSchema, TConfig> extends 'many'
            ? Array<EmbeddedDocType<TTarget, TRel>> // Array embed with field selection
            : InferEmbedCardinality<TSchema, TConfig> extends 'one'
              ? EmbeddedDocType<TTarget, TRel> // Single embed with field selection
              : EmbeddedDocType<TTarget, TRel> | Array<EmbeddedDocType<TTarget, TRel>> // Unknown, return union
          : never
        : never;
    }
  : {};

/**
 * Infer the full document type from a schema definition or collection definition
 * This represents what you get when reading from the database
 * MongoDB always adds _id: ObjectId to every document (unless explicitly defined in schema)
 * EMBED relations add optional embedded fields
 */
export type InferDocument<T> = ('_id' extends keyof ExtractSchemaOrUse<T>
  ? // If _id is explicitly defined in schema, use that type
    {
      [K in keyof ExtractSchemaOrUse<T>]: InferFieldType<ExtractSchemaOrUse<T>[K]>;
    }
  : // Otherwise, add _id: ObjectId automatically
    {
      _id: ObjectId;
    } & {
      [K in keyof ExtractSchemaOrUse<T>]: InferFieldType<ExtractSchemaOrUse<T>[K]>;
    }) &
  InferEmbeddedFields<T>;

/**
 * Helper to check if a field is optional
 * Now checks the type-level _configState instead of runtime _config
 */
type IsOptional<T extends AnyFieldBuilder> = T extends { _configState: { optional: true } }
  ? true
  : false;

/**
 * Helper to check if a field has a default value
 * Now checks the type-level _configState for hasDefault, hasDefaultNow, hasOnUpdateNow, or isSoftDeleteFlag
 * Soft delete flags implicitly default to null when creating records
 */
type HasDefault<T extends AnyFieldBuilder> = T extends {
  _configState: { hasDefault: true };
}
  ? true
  : T extends { _configState: { hasDefaultNow: true } }
    ? true
    : T extends { _configState: { hasOnUpdateNow: true } }
      ? true
      : T extends { _configState: { isSoftDeleteFlag: true } }
        ? true
        : false;

/**
 * Helper to check if a field is auto-generated (like _id or publicId)
 * Now checks the type-level _configState for isInternalId or isPublicId
 */
type IsAutoGenerated<T extends AnyFieldBuilder> = T extends {
  _configState: { isInternalId: true };
}
  ? true
  : T extends { _configState: { isPublicId: true } }
    ? true
    : false;

/**
 * Fields required for insert (no defaults, not auto-generated, not optional)
 */
type RequiredInsertFields<T> = {
  [K in keyof ExtractSchemaOrUse<T>]: IsAutoGenerated<ExtractSchemaOrUse<T>[K]> extends true
    ? never
    : HasDefault<ExtractSchemaOrUse<T>[K]> extends true
      ? never
      : IsOptional<ExtractSchemaOrUse<T>[K]> extends true
        ? never
        : K;
}[keyof ExtractSchemaOrUse<T>];

/**
 * Fields optional for insert (have defaults or are optional or auto-generated)
 */
type OptionalInsertFields<T> = {
  [K in keyof ExtractSchemaOrUse<T>]: IsAutoGenerated<ExtractSchemaOrUse<T>[K]> extends true
    ? K
    : HasDefault<ExtractSchemaOrUse<T>[K]> extends true
      ? K
      : IsOptional<ExtractSchemaOrUse<T>[K]> extends true
        ? K
        : never;
}[keyof ExtractSchemaOrUse<T>];

/**
 * Infer the insert type from a schema definition or collection definition
 * This represents what you pass when creating a new document
 */
export type InferInsert<T> = Pick<InferDocument<T>, RequiredInsertFields<T>> &
  Partial<Pick<InferDocument<T>, OptionalInsertFields<T>>>;

/**
 * Helper to get embedded field keys from a document type
 * These are optional fields with object/array types containing _id (auto-computed)
 */
type EmbedFieldKeys<T> = {
  [K in keyof T]: undefined extends T[K]
    ? NonNullable<T[K]> extends Array<{ _id: any }>
      ? K
      : NonNullable<T[K]> extends { _id: string }
        ? K
        : never
    : never;
}[keyof T];

/**
 * Infer the update type from a schema definition or collection definition
 * This represents what you can pass when updating a document
 * All fields are optional for updates
 * Excludes embedded fields since they're auto-computed
 */
export type InferUpdate<T> = Partial<Omit<InferDocument<T>, '_id' | EmbedFieldKeys<InferDocument<T>>>>;

/**
 * Utility type to extract schema from a collection definition
 */
export type ExtractSchema<T> = T extends { _schema: infer S extends SchemaDefinition } ? S : never;

/**
 * MongoDB filter type (simplified)
 * Allows either the exact value or filter operators for each field
 * Makes all fields optional since filters don't need to specify every field
 */
export type Filter<T> = {
  [K in keyof T]?: T[K] | FilterOperators<T[K]> | null;
} & {
  $and?: Filter<T>[];
  $or?: Filter<T>[];
  $nor?: Filter<T>[];
  // Allow any string keys for flexibility (e.g., embedded field paths like "user.name")
  // TODO: Improve this to better type embedded paths
  [key: string]: any;
};

/**
 * MongoDB filter operators
 */
export type FilterOperators<T> = {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $exists?: boolean;
  $regex?: RegExp | string;
  $options?: string;
};

/**
 * MongoDB update operators
 */
export type UpdateOperators<T> = {
  $set?: Partial<T>;
  $unset?: { [K in keyof T]?: '' | 1 | true };
  $inc?: { [K in keyof T]?: number };
  $mul?: { [K in keyof T]?: number };
  $rename?: { [K in keyof T]?: string };
  $min?: Partial<T>;
  $max?: Partial<T>;
  $currentDate?: {
    [K in keyof T]?: true | { $type: 'date' | 'timestamp' };
  };
  $push?: any;
  $pull?: any;
  $addToSet?: any;
  $pop?: any;
};

/**
 * Sort direction
 */
export type SortDirection = 1 | -1 | 'asc' | 'desc';

/**
 * Sort specification
 */
export type Sort<T> = {
  [K in keyof T]?: SortDirection;
};

/**
 * Projection specification
 */
export type Projection<T> = {
  [K in keyof T]?: 0 | 1 | boolean;
};

/**
 * Find options
 */
export interface FindOptions<T> {
  sort?: Sort<T>;
  limit?: number;
  skip?: number;
  projection?: Projection<T>;
}

/**
 * Find many result with pagination info
 */
export interface FindManyResult<T> {
  data: T[];
  hasMore: boolean;
  total?: number;
}
