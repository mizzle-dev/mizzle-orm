/**
 * ORM configuration and context types
 */

import type { MongoClient, ClientSession, ObjectId, Filter } from 'mongodb';
import type { CollectionDefinition, RelationTargets } from './collection';
import type { WithPopulated, WithPopulatedMany } from './relations-inference';
import type { IncludeConfig, WithIncluded } from './include';

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
export interface OrmConfig<TCollections extends Record<string, CollectionDefinition<any>> = Record<string, CollectionDefinition<any>>> {
  uri: string;
  dbName: string;
  collections: TCollections;

  middlewares?: OrmMiddleware[];
  validation?: ValidationConfig;
  audit?: AuditOrmConfig;
  devGuardrails?: DevGuardrailsConfig;

  // MongoDB client options
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

  // Relations
  populate<TRelationName extends keyof TRelationTargets & string>(
    docs: TDoc[],
    relationName: TRelationName,
  ): Promise<WithPopulated<TDoc, TRelationName, TRelationTargets>[]>;

  populate<
    TRel1 extends keyof TRelationTargets & string,
    TRel2 extends keyof TRelationTargets & string,
  >(
    docs: TDoc[],
    rel1: TRel1,
    rel2: TRel2,
  ): Promise<WithPopulatedMany<TDoc, [TRel1, TRel2], TRelationTargets>[]>;

  populate<
    TRel1 extends keyof TRelationTargets & string,
    TRel2 extends keyof TRelationTargets & string,
    TRel3 extends keyof TRelationTargets & string,
  >(
    docs: TDoc[],
    rel1: TRel1,
    rel2: TRel2,
    rel3: TRel3,
  ): Promise<WithPopulatedMany<TDoc, [TRel1, TRel2, TRel3], TRelationTargets>[]>;

  populate<
    TRel1 extends keyof TRelationTargets & string,
    TRel2 extends keyof TRelationTargets & string,
    TRel3 extends keyof TRelationTargets & string,
    TRel4 extends keyof TRelationTargets & string,
  >(
    docs: TDoc[],
    rel1: TRel1,
    rel2: TRel2,
    rel3: TRel3,
    rel4: TRel4,
  ): Promise<WithPopulatedMany<TDoc, [TRel1, TRel2, TRel3, TRel4], TRelationTargets>[]>;

  // Raw access
  rawCollection(): any;
}

/**
 * Database facade with dynamic collection accessors
 */
export type DbFacade<TCollections extends Record<string, CollectionDefinition<any, any>>> = {
  [K in keyof TCollections]: TCollections[K] extends CollectionDefinition<any, infer TRelationTargets>
    ? CollectionFacade<
        TCollections[K]['$inferDocument'],
        TCollections[K]['$inferInsert'],
        TCollections[K]['$inferUpdate'],
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
  withContext<TCollections extends Record<string, CollectionDefinition>>(
    ctx: OrmContext,
  ): DbFacade<TCollections>;
}

/**
 * Main ORM instance
 */
export interface MongoOrm<TCollections extends Record<string, CollectionDefinition> = any> {
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
