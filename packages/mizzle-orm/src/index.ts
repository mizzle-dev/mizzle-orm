/**
 * Mizzle ORM - MongoDB ORM with exceptional DX
 * @module @mizzle-dev/orm
 */

// Core exports
export { mizzle, defineSchema } from './orm/orm';
export { mongoCollection } from './collection/collection';

// Standard Schema collection factory
export {
  fromStandardSchema,
  isSSCollectionDefinition,
} from './collection/from-standard-schema';
export type {
  SSCollectionDefinition,
  SSCollectionOptions,
  SSCollectionMeta,
  ExtractSSDocument,
  ExtractSSInsert,
  ExtractSSUpdate,
} from './collection/from-standard-schema';

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

// Standard Schema integration
export type { StandardSchemaV1, IsStandardSchema, InferSSInput, InferSSOutput } from './types/standard-schema';
export type { InferSSDocument, InferSSInsert, InferSSUpdate } from './types/standard-schema-inference';

// Validation
export {
  generateDocumentSchema,
  generateInsertSchema,
  generateUpdateSchema,
} from './validation/zod-schema-generator';

// Middlewares
export {
  loggingMiddleware,
  performanceMiddleware,
  cachingMiddleware,
  auditMiddleware,
  retryMiddleware,
  validationMiddleware,
  MemoryCacheStore,
  ValidationError,
  compose,
  when,
  onOperations,
  onReads,
  onWrites,
  onCollections,
} from './middlewares/index';

export type {
  Middleware,
  MiddlewareContext,
  Operation,
  ReadOperation,
  WriteOperation,
} from './types/middleware';

export type {
  LoggingConfig,
  PerformanceConfig,
  CachingConfig,
  AuditConfig,
  RetryConfig,
  ValidationConfig,
  CacheStore,
  AuditStore,
  AuditLogEntry,
  ValidationResult,
} from './middlewares/index';

// Utilities
export { ObjectId } from 'mongodb';
