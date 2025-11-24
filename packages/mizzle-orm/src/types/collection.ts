/**
 * Collection definition and metadata types
 */

import type { Document } from 'mongodb';
import type { SchemaDefinition } from './field';
// import type { IndexConfig, AuditConfig } from './field'; // Used in field definitions
import type { InferDocument, InferInsert, InferUpdate } from './inference';
import type { OrmContext } from './orm';
import type { Middleware } from './middleware';

/**
 * Index definition function
 */
export type IndexDefinitionFn<TSchema extends SchemaDefinition> = (
  idx: IndexBuilder<TSchema>,
  fields: TSchema,
) => IndexDef[];

/**
 * Index builder for compound indexes
 */
export type IndexBuilder<TSchema extends SchemaDefinition> = (
  ...fields: Array<TSchema[keyof TSchema]>
) => IndexDefBuilder;

/**
 * Index definition builder for chaining
 */
export interface IndexDefBuilder {
  unique(): IndexDef;
  sparse(): IndexDef;
  ttl(seconds: number): IndexDef;
  name(name: string): IndexDef;
  partial(filter: Record<string, unknown>): IndexDef;
  background(): IndexDef;
}

/**
 * Index definition
 */
export interface IndexDef {
  fields: string[];
  options: {
    unique?: boolean;
    sparse?: boolean;
    ttl?: number;
    name?: string;
    partialFilterExpression?: Record<string, unknown>;
    background?: boolean;
  };
}

/**
 * Relation type
 */
export enum RelationType {
  REFERENCE = 'reference',
  EMBED = 'embed',
  LOOKUP = 'lookup',
}

/**
 * Reference relation configuration
 */
export interface ReferenceRelation {
  type: RelationType.REFERENCE;
  targetCollection: string;
  localField: string;
  foreignField: string;
  onDelete?: 'cascade' | 'restrict' | 'set-null';
  embed?: {
    field: string; // Field name where embedded data is stored
    fields: string[]; // Fields to embed from target
  };

  // Runtime reference to the target collection definition (for nested includes)
  _targetCollectionDef?: CollectionDefinition<any, any>;
}

/**
 * Reverse embed configuration
 */
export interface ReverseEmbedConfig {
  enabled?: boolean;
  strategy?: 'sync' | 'async' | 'manual'; // Default: 'async'
  watchFields?: string[]; // Only trigger if these fields change
  batchSize?: number; // Default: 100
  maxUpdates?: number; // Default: 10000
}

/**
 * Field projection type
 * Supports MongoDB projection syntax for inclusion/exclusion
 */
export type FieldProjection = Record<string, 1 | 0>;

/**
 * Forward embed configuration
 * Generic to preserve literal types for proper type inference
 *
 * @template TFrom - The literal type of the 'from' field path
 * @template TPaths - The literal type of the 'paths' array
 * @template TTargetDoc - The target document type (for constraining fields)
 */
export interface ForwardEmbedConfig<
  TFrom extends string = string,
  TPaths extends readonly string[] = string[],
  TTargetDoc = any
> {
  // ==== ID Location (Required - one or the other) ====

  // Simple: single field or path
  from?: TFrom;
  // Examples:
  // - 'authorId' → separate strategy
  // - 'author._id' → inplace strategy
  // - 'workflow.items[].refId' → array embed

  // Complex: multiple paths
  paths?: TPaths;
  // Examples:
  // - ['workflow.required[].ref._id', 'workflow.optional[].ref._id']

  // ==== Fields to Embed (Optional) ====
  projection?: TTargetDoc extends { [key: string]: any }
    ? Record<string, 1 | 0>
    : FieldProjection;

  // ==== ID Field Configuration ====
  embedIdField?: string; // Default: '_id'
  // Which field to use as _id in embedded object
  // Examples: '_id', 'id' (publicId), etc.

  // ==== Storage (Auto-Inferred) ====
  into?: string; // Where to store embed (for separate strategy). Defaults to relation name

  // ==== Reverse Updates (Optional) ====
  keepFresh?: boolean; // Shorthand for reverse: { enabled: true, strategy: 'async' }
  reverse?: ReverseEmbedConfig;
}

/**
 * Complete embed configuration type for the embed() function
 * Combines forward and reverse config with delete handling
 * Generic to preserve literal types for autocomplete and type safety
 *
 * @template TFrom - The literal type of the 'from' field path
 * @template TPaths - The literal type of the 'paths' array
 * @template TTargetDoc - The target document type (for constraining fields)
 */
export interface EmbedConfig<
  TFrom extends string = string,
  TPaths extends readonly string[] = string[],
  TTargetDoc = any
> {
  // Forward embed (required)
  forward?: ForwardEmbedConfig<TFrom, TPaths, TTargetDoc>;

  // Reverse embed (optional - auto-updates)
  reverse?: ReverseEmbedConfig;

  // Shorthand for reverse embed
  keepFresh?: boolean;

  // Delete handling (optional)
  onSourceDelete?: 'nullify' | 'cascade' | 'no-action';
}

/**
 * Embed relation configuration (write-time denormalization)
 * Generic to preserve literal types from ForwardEmbedConfig
 *
 * @template TFrom - The literal type of the 'from' field path
 * @template TPaths - The literal type of the 'paths' array
 * @template TTargetDoc - The target document type (for constraining fields)
 */
export interface EmbedRelation<
  TFrom extends string = string,
  TPaths extends readonly string[] = string[],
  TTargetDoc = any
> {
  type: RelationType.EMBED;
  sourceCollection: string;

  // New forward embed config
  forward?: ForwardEmbedConfig<TFrom, TPaths, TTargetDoc>;

  // Legacy support (for backwards compatibility during migration)
  strategy?: 'denormalized';
  extractIds?: (doc: Document) => string[];
  applyEmbeds?: (doc: Document, embeds: Document[]) => Document;

  // Default query options (can be overridden at query time)
  projection?: FieldProjection; // Default fields to include
  where?: any; // Default filter (ANDed with query-time filter)
  sort?: Record<string, 1 | -1>; // Default sort order
  limit?: number; // Default limit

  // Runtime reference to the source collection definition (for nested includes)
  _sourceCollectionDef?: CollectionDefinition<any, any>;
}

/**
 * Lookup relation configuration (virtual)
 */
export interface LookupRelation {
  type: RelationType.LOOKUP;
  targetCollection: string;
  localField: string;
  foreignField: string;
  as?: string; // Optional - defaults to relation name
  one?: boolean; // If true, populate single document; otherwise array
  pipeline?: Document[];

  // Default query options (can be overridden at query time)
  projection?: FieldProjection; // Default fields to include
  where?: any; // Default filter (ANDed with query-time filter)
  sort?: Record<string, 1 | -1>; // Default sort order
  limit?: number; // Default limit

  // Runtime reference to the target collection definition (for nested includes)
  _targetCollectionDef?: CollectionDefinition<any, any>;
}

/**
 * Any relation type
 */
export type AnyRelation = ReferenceRelation | EmbedRelation<any, any> | LookupRelation;

/**
 * Relations definition
 */
export type Relations = Record<string, AnyRelation>;

/**
 * Typed relation that preserves target collection information
 * At runtime, this is just the base relation object.
 * At type-level, it tracks the target collection for type inference.
 */
export type TypedRelation<
  TRel extends AnyRelation,
  TTarget extends CollectionDefinition<any, any>,
  TConfig = unknown,
> = TRel & {
  readonly _targetCollection?: TTarget; // Phantom type for tracking target (never exists at runtime)
  readonly _relConfig?: TConfig; // Phantom type for tracking config (never exists at runtime)
};

/**
 * Extract relation targets from a typed relations object
 * Now preserves the full TypedRelation for better type inference
 */
export type ExtractRelationTargets<TRelations> = {
  [K in keyof TRelations]: TRelations[K]; // Preserve full TypedRelation
};


/**
 * Policy filter function
 */
export type PolicyFilterFn<_TDoc = Document> = (ctx: OrmContext) => Record<string, unknown>;

/**
 * Policy guard function
 */
export type PolicyGuardFn<TDoc = Document> = (
  ctx: OrmContext,
  doc: TDoc,
  newDoc?: Partial<TDoc>,
) => boolean | Promise<boolean>;

/**
 * Policy builder
 */
export interface PolicyBuilder<TSchema extends SchemaDefinition> {
  readFilter(fn: PolicyFilterFn): this;
  writeFilter(fn: PolicyFilterFn): this;
  canInsert(fn: (ctx: OrmContext, doc: InferInsert<TSchema>) => boolean | Promise<boolean>): this;
  canUpdate(
    fn: (
      ctx: OrmContext,
      oldDoc: InferDocument<TSchema>,
      newDoc: Partial<InferDocument<TSchema>>,
    ) => boolean | Promise<boolean>,
  ): this;
  canDelete(fn: (ctx: OrmContext, doc: InferDocument<TSchema>) => boolean | Promise<boolean>): this;
}

/**
 * Policy configuration
 */
export interface PolicyConfig<TSchema extends SchemaDefinition> {
  readFilter?: PolicyFilterFn;
  writeFilter?: PolicyFilterFn;
  canInsert?: (ctx: OrmContext, doc: InferInsert<TSchema>) => boolean | Promise<boolean>;
  canUpdate?: (
    ctx: OrmContext,
    oldDoc: InferDocument<TSchema>,
    newDoc: Partial<InferDocument<TSchema>>,
  ) => boolean | Promise<boolean>;
  canDelete?: (ctx: OrmContext, doc: InferDocument<TSchema>) => boolean | Promise<boolean>;
}

/**
 * Hook functions
 */
export interface Hooks<TSchema extends SchemaDefinition> {
  beforeInsert?: (
    ctx: OrmContext,
    doc: InferInsert<TSchema>,
  ) => InferInsert<TSchema> | Promise<InferInsert<TSchema>>;
  afterInsert?: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>;
  beforeUpdate?: (
    ctx: OrmContext,
    oldDoc: InferDocument<TSchema>,
    newDoc: Partial<InferDocument<TSchema>>,
  ) => Partial<InferDocument<TSchema>> | Promise<Partial<InferDocument<TSchema>>>;
  afterUpdate?: (
    ctx: OrmContext,
    oldDoc: InferDocument<TSchema>,
    newDoc: InferDocument<TSchema>,
  ) => void | Promise<void>;
  beforeDelete?: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>;
  afterDelete?: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>;
}

/**
 * Hook builder
 */
export interface HookBuilder<TSchema extends SchemaDefinition> {
  beforeInsert(
    fn: (
      ctx: OrmContext,
      doc: InferInsert<TSchema>,
    ) => InferInsert<TSchema> | Promise<InferInsert<TSchema>>,
  ): this;
  afterInsert(fn: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>): this;
  beforeUpdate(
    fn: (
      ctx: OrmContext,
      oldDoc: InferDocument<TSchema>,
      newDoc: Partial<InferDocument<TSchema>>,
    ) => Partial<InferDocument<TSchema>> | Promise<Partial<InferDocument<TSchema>>>,
  ): this;
  afterUpdate(
    fn: (
      ctx: OrmContext,
      oldDoc: InferDocument<TSchema>,
      newDoc: InferDocument<TSchema>,
    ) => void | Promise<void>,
  ): this;
  beforeDelete(fn: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>): this;
  afterDelete(fn: (ctx: OrmContext, doc: InferDocument<TSchema>) => void | Promise<void>): this;
}

/**
 * Collection-level audit configuration
 */
export interface CollectionAuditConfig {
  enabled: boolean;
  logReads?: boolean;
  logWrites?: boolean;
  redact?: Record<string, 'omit' | 'mask' | 'hash'>;
}

/**
 * Collection options (the second argument to mongoCollection)
 *
 * @template TSchema - The schema definition
 * @template TRels - The typed relations object returned by the relations callback
 */
export interface CollectionOptions<
  TSchema extends SchemaDefinition,
  TRels extends Record<string, TypedRelation<any, any>> = {},
> {
  indexes?: IndexDefinitionFn<TSchema>;
  searchIndexes?: any; // TODO: Atlas Search index definitions
  relations?: TRels;
  policies?: PolicyConfig<TSchema>;
  audit?: CollectionAuditConfig;
  hooks?: Hooks<TSchema>;
  middlewares?: Middleware[];
}

/**
 * Collection metadata (internal representation)
 */
export interface CollectionMeta<
  TSchema extends SchemaDefinition = SchemaDefinition,
  TRelationTargets extends RelationTargets = {},
> {
  name: string;
  schema: TSchema;
  indexes: IndexDef[];
  searchIndexes: any[];
  relations: TRelationTargets;
  policies: PolicyConfig<TSchema>;
  audit: CollectionAuditConfig;
  hooks: Hooks<TSchema>;
  middlewares: Middleware[];
}

/**
 * Relation targets map - maps relation name to TypedRelation
 * Using 'any' here to avoid narrowing specific types when used as a constraint
 */
export type RelationTargets = Record<string, any>;

/**
 * Collection definition (what mongoCollection returns)
 *
 * @template TSchema - The schema definition for this collection's fields
 * @template TRelationTargets - Map of relation names to their target collections
 */
export interface CollectionDefinition<
  TSchema extends SchemaDefinition = SchemaDefinition,
  TRelationTargets extends RelationTargets = {},
> {
  readonly _schema: TSchema;
  readonly _meta: CollectionMeta<TSchema, TRelationTargets>;
  readonly _relationTargets: TRelationTargets; // Phantom type for relation target tracking
  readonly _brand: 'CollectionDefinition';

  // Type helpers
  readonly $inferDocument: InferDocument<CollectionDefinition<TSchema, TRelationTargets>>;
  readonly $inferInsert: InferInsert<CollectionDefinition<TSchema, TRelationTargets>>;
  readonly $inferUpdate: InferUpdate<CollectionDefinition<TSchema, TRelationTargets>>;
}

/**
 * Extract types from a collection definition
 */
export type ExtractDocument<T extends CollectionDefinition> = T['$inferDocument'];
export type ExtractInsert<T extends CollectionDefinition> = T['$inferInsert'];
export type ExtractUpdate<T extends CollectionDefinition> = T['$inferUpdate'];
