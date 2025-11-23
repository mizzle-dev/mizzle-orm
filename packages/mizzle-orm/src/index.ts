/**
 * Mizzle ORM - MongoDB ORM with exceptional DX
 * @module mizzle-orm
 */

// Core exports
export { mizzle, defineSchema } from './orm/orm';
export { mongoCollection } from './collection/collection';

// Relation factory functions
export { lookup, reference, embed } from './collection/relations';

// Field factory functions
export {
  string,
  number,
  boolean,
  date,
  objectId,
  publicId,
  decimal,
  binary,
  json,
  geoPoint,
  array,
  record,
  union,
  object,
} from './schema/fields';

// Types
export type { InferDocument, InferInsert, InferUpdate, InferFieldType } from './types/inference';

export type {
  FieldConfig,
  FieldType,
  AnyFieldBuilder,
  StringFieldBuilder,
  NumberFieldBuilder,
  BooleanFieldBuilder,
  DateFieldBuilder,
  ObjectIdFieldBuilder,
  PublicIdFieldBuilder,
  ObjectFieldBuilder,
} from './types/field';

export type { CollectionDefinition, CollectionMeta } from './types/collection';

export type { OrmContext, Mizzle, MizzleConfig } from './types/orm';

export type { IncludeConfig, NestedIncludeConfig, WithIncluded } from './types/include';

// Validation
export {
  generateDocumentSchema,
  generateInsertSchema,
  generateUpdateSchema,
} from './validation/zod-schema-generator';

// Utilities
export { ObjectId } from 'mongodb';
