/**
 * Built-in middlewares and composition utilities for Mizzle ORM
 */

import type { Middleware, MiddlewareContext, Operation } from '../types/middleware';

// ============================================================================
// BUILT-IN MIDDLEWARES
// ============================================================================

/**
 * Logging middleware configuration
 */
export interface LoggingConfig {
  /**
   * Log level
   * @default 'info'
   */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Custom logger implementation
   * @default console
   */
  logger?: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };

  /**
   * Include timing information in logs
   * @default true
   */
  includeTimings?: boolean;

  /**
   * Include filter/data in logs
   * @default false (can expose sensitive data)
   */
  includeDetails?: boolean;
}

/**
 * Logging middleware - logs all database operations
 *
 * @example
 * ```typescript
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     loggingMiddleware({ level: 'debug', includeTimings: true })
 *   ]
 * });
 * ```
 */
export function loggingMiddleware(config: LoggingConfig = {}): Middleware {
  const {
    level = 'info',
    logger = console,
    includeTimings = true,
    includeDetails = false,
  } = config;

  return async (ctx, next) => {
    const startTime = Date.now();
    const requestId = ctx.orm.requestId || 'unknown';
    const operation = `${ctx.collection}.${ctx.operation}`;

    // Log start
    if (level === 'debug' && includeDetails) {
      logger.debug(`[${requestId}] Starting ${operation}`, {
        filter: ctx.filter,
        data: ctx.data,
        options: ctx.options,
      });
    } else {
      logger[level](`[${requestId}] ${operation}`);
    }

    try {
      const result = await next();

      // Log completion
      if (includeTimings) {
        const duration = Date.now() - startTime;
        logger[level](`[${requestId}] ✓ ${operation} (${duration}ms)`);
      }

      return result;
    } catch (error) {
      // Log error
      const duration = Date.now() - startTime;
      logger.error(`[${requestId}] ✗ ${operation} failed (${duration}ms)`, error);
      throw error;
    }
  };
}

/**
 * Performance monitoring middleware configuration
 */
export interface PerformanceConfig {
  /**
   * Threshold in milliseconds for slow query warnings
   * @default 1000
   */
  slowQueryThreshold?: number;

  /**
   * Callback when a slow query is detected
   */
  onSlowQuery?: (duration: number, ctx: MiddlewareContext) => void;

  /**
   * Callback for all query timings
   */
  onQueryComplete?: (duration: number, ctx: MiddlewareContext) => void;
}

/**
 * Performance monitoring middleware - tracks query execution times
 *
 * @example
 * ```typescript
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     performanceMiddleware({
 *       slowQueryThreshold: 500,
 *       onSlowQuery: (duration, ctx) => {
 *         console.warn(`Slow query detected: ${ctx.collection}.${ctx.operation} took ${duration}ms`);
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export function performanceMiddleware(config: PerformanceConfig = {}): Middleware {
  const {
    slowQueryThreshold = 1000,
    onSlowQuery,
    onQueryComplete,
  } = config;

  return async (ctx, next) => {
    const startTime = performance.now();

    try {
      const result = await next();
      return result;
    } finally {
      const duration = performance.now() - startTime;

      // Always call onQueryComplete if provided
      onQueryComplete?.(duration, ctx);

      // Check for slow queries
      if (duration > slowQueryThreshold) {
        if (onSlowQuery) {
          onSlowQuery(duration, ctx);
        } else {
          console.warn(
            `[Slow Query] ${ctx.collection}.${ctx.operation} took ${Math.round(duration)}ms (threshold: ${slowQueryThreshold}ms)`,
          );
        }
      }
    }
  };
}

/**
 * Cache store interface
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear?(): Promise<void>;
}

/**
 * Simple in-memory cache store implementation
 */
export class MemoryCacheStore implements CacheStore {
  private cache = new Map<string, { value: any; expires: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl: number = 60): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * Caching middleware configuration
 */
export interface CachingConfig {
  /**
   * Cache store implementation
   */
  store: CacheStore;

  /**
   * Time-to-live in seconds
   * @default 60
   */
  ttl?: number;

  /**
   * Custom cache key generator
   * @default JSON.stringify-based key generation
   */
  keyGenerator?: (ctx: MiddlewareContext) => string;

  /**
   * Operations to cache (defaults to read operations only)
   */
  operations?: Operation[];
}

/**
 * Caching middleware - caches read operations
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 *
 * const redis = new Redis();
 * const redisStore: CacheStore = {
 *   get: (key) => redis.get(key).then(v => v ? JSON.parse(v) : null),
 *   set: (key, value, ttl) => redis.set(key, JSON.stringify(value), 'EX', ttl),
 *   del: (key) => redis.del(key).then(() => {}),
 * };
 *
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     cachingMiddleware({ store: redisStore, ttl: 300 })
 *   ]
 * });
 * ```
 */
export function cachingMiddleware(config: CachingConfig): Middleware {
  const {
    store,
    ttl = 60,
    keyGenerator,
    operations,
  } = config;

  const defaultKeyGenerator = (ctx: MiddlewareContext): string => {
    const parts = [
      ctx.collection,
      ctx.operation,
      JSON.stringify(ctx.filter || {}),
      JSON.stringify(ctx.options || {}),
    ];
    return `mizzle:${parts.join(':')}`;
  };

  const getKey = keyGenerator || defaultKeyGenerator;

  return async <TResult>(ctx: MiddlewareContext, next: () => Promise<TResult>): Promise<TResult> => {
    // Only cache specified operations or read operations by default
    const shouldCache = operations
      ? operations.includes(ctx.operation)
      : ctx.operation.startsWith('find') || ctx.operation === 'count';

    if (!shouldCache) {
      return next();
    }

    // Try to get from cache
    const cacheKey = getKey(ctx);
    const cached = await store.get(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached as TResult;
    }

    // Execute query
    const result = await next();

    // Store in cache (don't await to avoid blocking)
    store.set(cacheKey, result, ttl).catch((err) => {
      console.error('Cache set error:', err);
    });

    return result;
  };
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: Date;
  user?: any;
  collection: string;
  operation: Operation;
  filter?: any;
  data?: any;
  oldDoc?: any;
  result?: any;
  metadata?: Record<string, unknown>;
}

/**
 * Audit store interface
 */
export interface AuditStore {
  log(entry: AuditLogEntry): Promise<void>;
}

/**
 * Audit middleware configuration
 */
export interface AuditConfig {
  /**
   * Audit store implementation
   */
  store?: AuditStore;

  /**
   * Include read operations in audit log
   * @default false
   */
  includeReads?: boolean;

  /**
   * Operations to audit (overrides includeReads if specified)
   */
  operations?: Operation[];

  /**
   * Custom audit entry transformer
   */
  transformEntry?: (entry: AuditLogEntry) => AuditLogEntry;
}

/**
 * Audit trail middleware - logs all write operations for compliance
 *
 * @example
 * ```typescript
 * const auditStore: AuditStore = {
 *   log: async (entry) => {
 *     await db.auditLogs.insertOne(entry);
 *   }
 * };
 *
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     auditMiddleware({ store: auditStore, includeReads: false })
 *   ]
 * });
 * ```
 */
export function auditMiddleware(config: AuditConfig = {}): Middleware {
  const {
    store,
    includeReads = false,
    operations,
    transformEntry,
  } = config;

  const defaultStore: AuditStore = {
    log: async (entry) => {
      console.log('[AUDIT]', JSON.stringify(entry));
    },
  };

  const auditStore = store || defaultStore;

  return async (ctx, next) => {
    // Determine if we should audit this operation
    const writeOps: Operation[] = ['create', 'update', 'updateById', 'updateMany', 'delete', 'deleteById', 'deleteMany', 'softDelete'];
    const shouldAudit = operations
      ? operations.includes(ctx.operation)
      : includeReads || writeOps.includes(ctx.operation);

    if (!shouldAudit) {
      return next();
    }

    // Execute operation
    const result = await next();

    // Create audit log entry
    let entry: AuditLogEntry = {
      timestamp: new Date(),
      user: ctx.orm.user,
      collection: ctx.collection,
      operation: ctx.operation,
      filter: ctx.filter,
      data: ctx.data,
      oldDoc: ctx.oldDoc,
      result: result,
      metadata: ctx.metadata,
    };

    // Transform if needed
    if (transformEntry) {
      entry = transformEntry(entry);
    }

    // Log asynchronously (don't block)
    auditStore.log(entry).catch((err) => {
      console.error('Audit log error:', err);
    });

    return result;
  };
}

/**
 * Retry middleware configuration
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Backoff strategy function (returns delay in ms for given attempt number)
   * @default Exponential backoff: 100ms * 2^attempt
   */
  backoff?: (attempt: number) => number;

  /**
   * Predicate to determine if error should be retried
   * @default Retries on network/connection errors
   */
  retryIf?: (error: Error) => boolean;

  /**
   * Operations to apply retry logic to
   * @default All operations
   */
  operations?: Operation[];
}

/**
 * Retry middleware - automatically retries failed operations
 *
 * @example
 * ```typescript
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     retryMiddleware({
 *       maxRetries: 3,
 *       backoff: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000),
 *       retryIf: (error) => error.message.includes('network')
 *     })
 *   ]
 * });
 * ```
 */
export function retryMiddleware(config: RetryConfig = {}): Middleware {
  const {
    maxRetries = 3,
    backoff = (attempt) => 100 * Math.pow(2, attempt),
    retryIf = (error) => {
      // Retry on common transient errors
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('enotfound')
      );
    },
    operations,
  } = config;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return async (ctx, next) => {
    // Check if retry applies to this operation
    if (operations && !operations.includes(ctx.operation)) {
      return next();
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await next();
      } catch (error) {
        lastError = error as Error;

        // Don't retry if we've exhausted attempts
        if (attempt >= maxRetries) {
          break;
        }

        // Check if we should retry this error
        if (!retryIf(lastError)) {
          break;
        }

        // Wait before retrying
        const delay = backoff(attempt);
        console.warn(
          `[Retry] ${ctx.collection}.${ctx.operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }

    // All retries exhausted
    throw lastError;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validation middleware configuration
 */
export interface ValidationConfig {
  /**
   * Validator function
   */
  validator: (data: any, operation: Operation) => ValidationResult | Promise<ValidationResult>;

  /**
   * Operations to validate
   * @default ['create', 'update', 'updateById', 'updateMany']
   */
  operations?: Operation[];
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  constructor(
    public errors: string[],
    message = 'Validation failed',
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validation middleware - validates data before write operations
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(1),
 * });
 *
 * const db = await mizzle({
 *   uri, dbName, schema,
 *   middlewares: [
 *     validationMiddleware({
 *       validator: (data, operation) => {
 *         if (operation === 'create') {
 *           const result = userSchema.safeParse(data);
 *           return {
 *             valid: result.success,
 *             errors: result.success ? [] : result.error.errors.map(e => e.message)
 *           };
 *         }
 *         return { valid: true };
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export function validationMiddleware(config: ValidationConfig): Middleware {
  const {
    validator,
    operations = ['create', 'update', 'updateById', 'updateMany'],
  } = config;

  return async (ctx, next) => {
    // Only validate specified operations
    if (!operations.includes(ctx.operation)) {
      return next();
    }

    // Only validate if there's data
    if (!ctx.data) {
      return next();
    }

    // Run validation
    const result = await validator(ctx.data, ctx.operation);

    if (!result.valid) {
      throw new ValidationError(result.errors || ['Validation failed']);
    }

    return next();
  };
}

// ============================================================================
// COMPOSITION UTILITIES
// ============================================================================

/**
 * Compose multiple middlewares into a single middleware
 *
 * @example
 * ```typescript
 * const combined = compose(
 *   loggingMiddleware(),
 *   performanceMiddleware(),
 *   cachingMiddleware({ store: cache })
 * );
 * ```
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async <TResult>(ctx: MiddlewareContext, next: () => Promise<TResult>): Promise<TResult> => {
    // Build chain from right to left
    let index = -1;

    const dispatch = async (i: number): Promise<TResult> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      const middleware = middlewares[i];
      if (!middleware) {
        return next();
      }

      return middleware(ctx, () => dispatch(i + 1));
    };

    return dispatch(0);
  };
}

/**
 * Conditionally apply middleware based on a predicate
 *
 * @example
 * ```typescript
 * const cacheReads = when(
 *   (ctx) => ctx.operation.startsWith('find'),
 *   cachingMiddleware({ store: cache })
 * );
 * ```
 */
export function when(
  predicate: (ctx: MiddlewareContext) => boolean,
  middleware: Middleware,
): Middleware {
  return async (ctx, next) => {
    if (predicate(ctx)) {
      return middleware(ctx, next);
    }
    return next();
  };
}

/**
 * Apply middleware only to specific operations
 *
 * @example
 * ```typescript
 * const auditWrites = onOperations(
 *   ['create', 'update', 'delete'],
 *   auditMiddleware({ store: auditStore })
 * );
 * ```
 */
export function onOperations(
  operations: Operation[],
  middleware: Middleware,
): Middleware {
  return when((ctx) => operations.includes(ctx.operation), middleware);
}

/**
 * Apply middleware only to read operations
 *
 * @example
 * ```typescript
 * const cacheReads = onReads(cachingMiddleware({ store: cache }));
 * ```
 */
export function onReads(middleware: Middleware): Middleware {
  return when(
    (ctx) =>
      ['findOne', 'findById', 'findMany', 'aggregate', 'count'].includes(ctx.operation),
    middleware,
  );
}

/**
 * Apply middleware only to write operations
 *
 * @example
 * ```typescript
 * const auditWrites = onWrites(auditMiddleware({ store: auditStore }));
 * ```
 */
export function onWrites(middleware: Middleware): Middleware {
  return when(
    (ctx) =>
      !['findOne', 'findById', 'findMany', 'aggregate', 'count'].includes(ctx.operation),
    middleware,
  );
}

/**
 * Apply middleware only to specific collections
 *
 * @example
 * ```typescript
 * const auditUsers = onCollections(
 *   ['users', 'roles'],
 *   auditMiddleware({ store: auditStore })
 * );
 * ```
 */
export function onCollections(
  collections: string[],
  middleware: Middleware,
): Middleware {
  return when((ctx) => collections.includes(ctx.collection), middleware);
}
