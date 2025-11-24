import type { Document, Filter } from 'mongodb';
import type { CollectionDefinition } from './collection';
import type { OrmContext, QueryOptions } from './orm';

/**
 * All possible ORM operations
 */
export type Operation =
  | 'findOne'
  | 'findById'
  | 'findMany'
  | 'create'
  | 'insertMany'
  | 'update'
  | 'updateById'
  | 'updateMany'
  | 'delete'
  | 'deleteById'
  | 'deleteMany'
  | 'softDelete'
  | 'restore'
  | 'aggregate'
  | 'count';

/**
 * Read operations (queries that don't modify data)
 */
export type ReadOperation = Extract<
  Operation,
  'findOne' | 'findById' | 'findMany' | 'aggregate' | 'count'
>;

/**
 * Write operations (queries that modify data)
 */
export type WriteOperation = Exclude<Operation, ReadOperation>;

/**
 * Context passed to middleware functions
 */
export interface MiddlewareContext<TDoc = any> {
  /**
   * ORM context with user, tenant, session information
   */
  orm: OrmContext;

  /**
   * Name of the collection being operated on
   */
  collection: string;

  /**
   * Type of operation being performed
   */
  operation: Operation;

  /**
   * Timestamp when the operation started
   */
  startedAt: number;

  /**
   * Collection definition with schema and relations
   */
  collectionDef: CollectionDefinition<any, any>;

  /**
   * Filter for find/update/delete operations
   */
  filter?: Filter<TDoc>;

  /**
   * Data for create/update operations
   */
  data?: any;

  /**
   * Query options (sort, limit, include, etc.)
   */
  options?: QueryOptions;

  /**
   * Original document before update/delete (when available)
   */
  oldDoc?: TDoc;

  /**
   * MongoDB aggregation pipeline (for aggregate operations or includes)
   */
  pipeline?: Document[];

  /**
   * Additional custom metadata that can be attached by other middlewares
   */
  metadata?: Record<string, unknown>;
}

/**
 * Middleware function signature
 *
 * @template TResult - The return type of the operation (preserved through the chain)
 * @param ctx - Context information about the operation
 * @param next - Function to call the next middleware or the actual operation
 * @returns Promise resolving to the operation result
 *
 * @example
 * ```typescript
 * const loggingMiddleware: Middleware = async (ctx, next) => {
 *   console.log(`${ctx.collection}.${ctx.operation}`);
 *   const result = await next();
 *   console.log('Operation completed');
 *   return result;
 * };
 * ```
 */
export type Middleware = <TResult>(
  ctx: MiddlewareContext,
  next: () => Promise<TResult>,
) => Promise<TResult>;

/**
 * Middleware that can be conditionally applied
 */
export type ConditionalMiddleware = {
  condition: (ctx: MiddlewareContext) => boolean;
  middleware: Middleware;
};

/**
 * Type guard to check if operation is a read operation
 */
export function isReadOperation(op: Operation): op is ReadOperation {
  return ['findOne', 'findById', 'findMany', 'aggregate', 'count'].includes(
    op,
  );
}

/**
 * Type guard to check if operation is a write operation
 */
export function isWriteOperation(op: Operation): op is WriteOperation {
  return !isReadOperation(op);
}
