/**
 * ORM configuration and context types
 */

import type { MongoClient, ClientSession, ObjectId } from 'mongodb';
import type { CollectionDefinition } from './collection';

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
export interface OrmConfig {
  uri: string;
  dbName: string;
  collections: CollectionDefinition[];

  middlewares?: OrmMiddleware[];
  validation?: ValidationConfig;
  audit?: AuditOrmConfig;
  devGuardrails?: DevGuardrailsConfig;

  // MongoDB client options
  clientOptions?: Parameters<typeof MongoClient.connect>[1];
}

/**
 * Collection facade for type-safe operations
 */
export interface CollectionFacade<TDoc = any, TInsert = any, TUpdate = any> {
  // Basic queries
  findById(id: string | ObjectId): Promise<TDoc | null>;
  findOne(filter: Record<string, any>): Promise<TDoc | null>;
  findMany(filter?: Record<string, any>, options?: any): Promise<TDoc[]>;

  // Mutations
  create(data: TInsert): Promise<TDoc>;
  updateById(id: string | ObjectId, data: TUpdate): Promise<TDoc | null>;
  updateOne(filter: Record<string, any>, data: TUpdate): Promise<TDoc | null>;
  updateMany(filter: Record<string, any>, data: TUpdate): Promise<number>;
  deleteById(id: string | ObjectId): Promise<boolean>;
  deleteOne(filter: Record<string, any>): Promise<boolean>;
  deleteMany(filter: Record<string, any>): Promise<number>;

  // Soft delete
  softDelete(id: string | ObjectId): Promise<TDoc | null>;
  restore(id: string | ObjectId): Promise<TDoc | null>;

  // Aggregation
  count(filter?: Record<string, any>): Promise<number>;
  aggregate(pipeline: any[]): Promise<any[]>;

  // Raw access
  rawCollection(): any;
}

/**
 * Database facade with dynamic collection accessors
 */
export type DbFacade<TCollections extends Record<string, CollectionDefinition>> = {
  [K in keyof TCollections]: CollectionFacade<
    TCollections[K]['$inferDocument'],
    TCollections[K]['$inferInsert'],
    TCollections[K]['$inferUpdate']
  >;
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
