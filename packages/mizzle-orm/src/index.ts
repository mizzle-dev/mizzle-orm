/**
 * Mizzle ORM - MongoDB ORM with exceptional DX
 * @module mizzle-orm
 */

// Core exports
export { createMongoOrm } from './orm/orm';
export { mongoCollection } from './collection/collection';

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
} from './types/field';

export type { CollectionDefinition, CollectionMeta } from './types/collection';

export type { OrmContext, OrmConfig, MongoOrm } from './types/orm';

// Validation
export {
  generateDocumentSchema,
  generateInsertSchema,
  generateUpdateSchema,
} from './validation/zod-schema-generator';

// Utilities
export { ObjectId } from 'mongodb';
