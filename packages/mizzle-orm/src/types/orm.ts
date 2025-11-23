/**
 * ORM configuration and context types
 */

import type { MongoClient, ClientSession, ObjectId } from 'mongodb';
import type { RelationTargets, CollectionDefinition } from './collection';
import type { IncludeConfig, WithIncluded } from './include';
import type { Filter, InferDocument, InferInsert, InferUpdate } from './inference';

/**
 * User context for RLS and audit
 */
export interface UserContext {
  id: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Request context passed to ORM operations
 */
export interface OrmContext {
  // Request tracking
  requestId?: string;
  correlationId?: string;

  // User & tenant
  user?: UserContext;
  tenantId?: string;
  tenantIdObjectId?: ObjectId;

  // Request metadata
  ip?: string;
  userAgent?: string;
  timestamp?: Date;

  // Transaction session (if in a transaction)
  session?: ClientSession;

  // Extensible context
  [key: string]: unknown;
}

/**
 * Middleware function
 */
export type OrmMiddleware = <TResult>(
  ctx: OrmContext,
  next: () => Promise<TResult>,
  meta: {
    collection: string;
    operation: string;
    args: unknown;
  },
) => Promise<TResult>;

/**
 * Validation strategy
 */
export type ValidationStrategy = 'none' | 'zod' | 'both';

/**
 * Validation configuration
 */
export interface ValidationConfig {
  onWrite?: ValidationStrategy;
  onRead?: ValidationStrategy;
}

/**
 * Audit configuration
 */
export interface AuditOrmConfig {
  enabled: boolean;
  collectionName?: string;
  defaultRetentionDays?: number;
}

/**
 * Dev guardrails configuration
 */
export interface DevGuardrailsConfig {
  requireIndexedQueries?: boolean;
  warnOnUnindexed?: boolean;
}

/**
 * ORM configuration
 */
export interface OrmConfig<TCollections = Record<string, CollectionDefinition>> {
  uri?: string; // Optional if client is provided
  dbName: string;
  collections: TCollections;

  middlewares?: OrmMiddleware[];
  validation?: ValidationConfig;
  audit?: AuditOrmConfig;
  devGuardrails?: DevGuardrailsConfig;

  // MongoDB client (provide for connection pooling)
  client?: MongoClient;

  // MongoDB client options (only used if client is not provided)
  clientOptions?: Parameters<typeof MongoClient.connect>[1];
}

/**
 * Query options for find operations
 */
export interface QueryOptions<TRelationTargets extends RelationTargets = {}> {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  include?: IncludeConfig<TRelationTargets>;
  refreshEmbeds?: Array<keyof TRelationTargets & string>; // Re-fetch fresh embed data (read-only, not persisted)
}

/**
 * Options for manual embed refresh
 */
export interface RefreshEmbedsOptions<TDoc = any> {
  filter?: Filter<TDoc>; // Optional filter for which documents to refresh
  batchSize?: number; // Process in batches (default: 100)
  dryRun?: boolean; // Preview changes without persisting (default: false)
}

/**
 * Statistics from a refresh operation
 */
export interface RefreshStats {
  matched: number; // Documents that matched the filter
  updated: number; // Documents successfully updated
  errors: number; // Errors encountered
  skipped: number; // Documents skipped (source not found)
}

/**
 * Collection facade for type-safe operations
 */
export interface CollectionFacade<TDoc = any, TInsert = any, TUpdate = any, TRelationTargets extends RelationTargets = {}> {
  // Basic queries
  findById(id: string | ObjectId, options?: Omit<QueryOptions<TRelationTargets>, 'include'>): Promise<TDoc | null>;
  findById<TInclude extends IncludeConfig<TRelationTargets>>(
    id: string | ObjectId,
    options: QueryOptions<TRelationTargets> & { include: TInclude },
  ): Promise<WithIncluded<TDoc, TInclude, TRelationTargets> | null>;

  findOne(filter: Filter<TDoc>, options?: Omit<QueryOptions<TRelationTargets>, 'include'>): Promise<TDoc | null>;
  findOne<TInclude extends IncludeConfig<TRelationTargets>>(
    filter: Filter<TDoc>,
    options: QueryOptions<TRelationTargets> & { include: TInclude },
  ): Promise<WithIncluded<TDoc, TInclude, TRelationTargets> | null>;

  findMany(filter?: Filter<TDoc>, options?: Omit<QueryOptions<TRelationTargets>, 'include'>): Promise<TDoc[]>;
  findMany<TInclude extends IncludeConfig<TRelationTargets>>(
    filter: Filter<TDoc> | undefined,
    options: QueryOptions<TRelationTargets> & { include: TInclude },
  ): Promise<WithIncluded<TDoc, TInclude, TRelationTargets>[]>;

  // Mutations
  create(data: TInsert): Promise<TDoc>;
  updateById(id: string | ObjectId, data: TUpdate): Promise<TDoc | null>;
  updateOne(filter: Filter<TDoc>, data: TUpdate): Promise<TDoc | null>;
  updateMany(filter: Filter<TDoc>, data: TUpdate): Promise<number>;
  deleteById(id: string | ObjectId): Promise<boolean>;
  deleteOne(filter: Filter<TDoc>): Promise<boolean>;
  deleteMany(filter: Filter<TDoc>): Promise<number>;

  // Soft delete
  softDelete(id: string | ObjectId): Promise<TDoc | null>;
  restore(id: string | ObjectId): Promise<TDoc | null>;

  // Aggregation
  count(filter?: Filter<TDoc>): Promise<number>;
  aggregate(pipeline: any[]): Promise<any[]>;

  // Embed refresh
  refreshEmbeds(
    relationName: keyof TRelationTargets & string,
    options?: RefreshEmbedsOptions<TDoc>
  ): Promise<RefreshStats>;

  // Raw access
  rawCollection(): any;
}

/**
 * Database facade with dynamic collection accessors
 */
export type DbFacade<TCollections> = {
  [K in keyof TCollections]: TCollections[K] extends CollectionDefinition<infer TSchema, infer TRelationTargets extends RelationTargets>
    ? CollectionFacade<
        InferDocument<CollectionDefinition<TSchema, TRelationTargets>>,
        InferInsert<CollectionDefinition<TSchema, TRelationTargets>>,
        InferUpdate<CollectionDefinition<TSchema, TRelationTargets>>,
        TRelationTargets
      >
    : never;
};

/**
 * Transaction helper
 */
export interface TransactionHelper {
  <T>(ctx: OrmContext, fn: (tx: MongoOrmTransaction) => Promise<T>): Promise<T>;
}

/**
 * ORM transaction instance
 */
export interface MongoOrmTransaction {
  withContext<TCollections extends Record<string, any>>(
    ctx: OrmContext,
  ): DbFacade<TCollections>;
}

/**
 * Main ORM instance
 */
export interface MongoOrm<TCollections extends Record<string, any> = any> {
  // Context management
  createContext(partial: Partial<OrmContext>): OrmContext;
  withContext(ctx: OrmContext): DbFacade<TCollections>;

  // Transactions
  tx: TransactionHelper;

  // Utilities
  rawClient(): MongoClient;
  close(): Promise<void>;

  // Metadata
  collections: TCollections;
}

/**
 * Type helper to infer the ORM type from a collections object
 *
 * @example
 * ```typescript
 * const collections = defineCollections({ users, posts, comments });
 * let orm!: InferOrm<typeof collections>;
 *
 * beforeAll(async () => {
 *   orm = await createMongoOrm({ uri, dbName, collections });
 * });
 * ```
 */
export type InferOrm<TCollections extends Record<string, any>> = MongoOrm<TCollections>;

/**
 * Mizzle configuration
 */
export interface MizzleConfig<TSchema extends Record<string, any> = Record<string, any>> {
  uri?: string; // Optional if client is provided
  dbName: string;
  schema: TSchema;

  middlewares?: OrmMiddleware[];
  validation?: ValidationConfig;
  audit?: AuditOrmConfig;
  devGuardrails?: DevGuardrailsConfig;

  // MongoDB client (provide for connection pooling)
  client?: MongoClient;

  // MongoDB client options (only used if client is not provided)
  clientOptions?: Parameters<typeof MongoClient.connect>[1];
}

/**
 * Mizzle callable function signature
 */
export interface MizzleFunction<TSchema extends Record<string, any>> {
  (ctx?: Partial<OrmContext>): DbFacade<TSchema>;
}

/**
 * Mizzle properties
 */
export interface MizzleProperties<TSchema extends Record<string, any>> {
  /** Schema definitions (collection metadata) */
  schema: TSchema;

  /** Raw MongoDB client */
  client: MongoClient;

  /** Transaction helper */
  tx: TransactionHelper;

  /** Close database connection */
  close(): Promise<void>;

  /** Internal ORM instance (for advanced use cases) */
  _orm: MongoOrm<TSchema>;
}

/**
 * Mizzle - The main database instance
 *
 * Can be called as a function to get a scoped database facade,
 * or accessed as an object for utilities and metadata.
 *
 * @example
 * ```typescript
 * const db = await mizzle({ uri, dbName, schema });
 *
 * // Call with context
 * await db({ user }).users.findMany({});
 *
 * // Access utilities
 * db.schema.users  // Collection metadata
 * db.client        // MongoClient
 * await db.close() // Cleanup
 * ```
 */
export type Mizzle<TSchema extends Record<string, any>> =
  MizzleFunction<TSchema> & MizzleProperties<TSchema>;
