/**
 * Main ORM implementation
 */

import { MongoClient } from 'mongodb';
import type {
  OrmConfig,
  OrmContext,
  MongoOrm,
  DbFacade,
  TransactionHelper,
  MizzleConfig,
  Mizzle,
  MizzleTransactionHelper,
} from '../types/orm';
import type { AnyRelation } from '../types/collection';
import { ObjectId } from 'mongodb';
import { nanoid } from 'nanoid';
import { CollectionFacade } from '../query/collection-facade';

/**
 * Helper function to create properly typed collections object.
 * This preserves exact types for perfect type inference.
 *
 * @example
 * ```ts
 * const collections = defineCollections({ users, posts });
 * const orm = await createMongoOrm({
 *   uri: process.env.MONGO_URI!,
 *   dbName: 'myapp',
 *   collections,
 * });
 * ```
 */
export function defineCollections<T>(
  collections: T,
): T {
  return collections;
}

/**
 * Helper function to create properly typed schema object.
 * Alias for defineCollections with clearer semantics.
 * This preserves exact types for perfect type inference.
 *
 * @example
 * ```ts
 * const schema = defineSchema({ users, posts });
 * const db = await mizzle({
 *   uri: process.env.MONGO_URI!,
 *   dbName: 'myapp',
 *   schema,
 * });
 * ```
 */
export function defineSchema<T>(
  schema: T,
): T {
  return schema;
}

/**
 * Create a Mizzle ORM instance
 *
 * @param config - ORM configuration
 * @returns ORM instance
 *
 * @example
 * ```ts
 * const orm = await createMongoOrm({
 *   uri: process.env.MONGO_URI!,
 *   dbName: 'myapp',
 *   collections: [users, projects],
 * });
 *
 * const ctx = orm.createContext({ user, tenantId });
 * const db = orm.withContext(ctx);
 * const user = await db.users.findOne({ email: 'alice@example.com' });
 * ```
 */
export async function createMongoOrm<TCollections extends Record<string, any>>(
  config: OrmConfig<TCollections>,
): Promise<MongoOrm<TCollections>> {
  // Use provided client or create new one
  let client: MongoClient;
  let clientOwned = false; // Track if we created the client

  if (config.client) {
    // Use provided client (for connection pooling)
    client = config.client;
  } else {
    // Create new client
    if (!config.uri) {
      throw new Error('Either "client" or "uri" must be provided in ORM config');
    }
    client = new MongoClient(config.uri, config.clientOptions);
    await client.connect();
    clientOwned = true;
  }

  // Get database instance
  const db = client.db(config.dbName);

  // Build collection registry from the collections object for internal lookups
  const collectionRegistry = new Map<string, any>();
  for (const [key, collectionDef] of Object.entries(config.collections)) {
    // Register by object key (e.g., 'users' from { users: mongoCollection(...) })
    collectionRegistry.set(key, collectionDef);
    // Also register by collection name if different (e.g., 'user_table')
    if (key !== collectionDef._meta.name) {
      collectionRegistry.set(collectionDef._meta.name, collectionDef);
    }
  }

  // Build reverse embed registry
  // Maps: sourceCollectionName → Array<{ targetCollection, embedRelationName, config }>
  const reverseEmbedRegistry = new Map<
    string,
    Array<{ targetCollectionName: string; relationName: string; config: any }>
  >();

  for (const [_, targetCollectionDef] of Object.entries(config.collections)) {
    const relations = targetCollectionDef._meta.relations || {};
    for (const [relationName, relation] of Object.entries(relations)) {
      const typedRelation = relation as AnyRelation;
      if (typedRelation.type === 'embed' && (typedRelation as any).forward) {
        const embedRelation = typedRelation as any;
        // Reverse config can be:
        // 1. keepFresh: true at top level (shorthand for sync strategy)
        // 2. reverse: { enabled, watchFields } at top level
        // 3. forward.reverse: { enabled, watchFields } inside forward config (deprecated)
        const reverseConfig = embedRelation.keepFresh
          ? { enabled: true, strategy: 'sync' as const }
          : embedRelation.reverse || embedRelation.forward.reverse;

        if (reverseConfig?.enabled) {
          const sourceCollectionName = embedRelation.sourceCollection;
          if (!reverseEmbedRegistry.has(sourceCollectionName)) {
            reverseEmbedRegistry.set(sourceCollectionName, []);
          }
          reverseEmbedRegistry.get(sourceCollectionName)!.push({
            targetCollectionName: targetCollectionDef._meta.name,
            relationName,
            config: { ...embedRelation.forward, reverse: reverseConfig },
          });
        }
      }
    }
  }

  // Build delete cascade registry
  // Maps: sourceCollectionName → Array<{ targetCollection, relationName, deleteAction }>
  const deleteRegistry = new Map<
    string,
    Array<{ targetCollectionName: string; relationName: string; config: any; deleteAction: string }>
  >();

  for (const [_, targetCollectionDef] of Object.entries(config.collections)) {
    const relations = targetCollectionDef._meta.relations || {};
    for (const [relationName, relation] of Object.entries(relations)) {
      const typedRelation = relation as AnyRelation;
      if (typedRelation.type === 'embed' && (typedRelation as any).forward) {
        const embedRelation = typedRelation as any;
        const deleteAction = embedRelation.onSourceDelete || 'no-action';

        // Only register if there's an action to take
        if (deleteAction !== 'no-action') {
          const sourceCollectionName = embedRelation.sourceCollection;
          if (!deleteRegistry.has(sourceCollectionName)) {
            deleteRegistry.set(sourceCollectionName, []);
          }
          deleteRegistry.get(sourceCollectionName)!.push({
            targetCollectionName: targetCollectionDef._meta.name,
            relationName,
            config: embedRelation.forward,
            deleteAction,
          });
        }
      }
    }
  }

  // Collections are already in the right format
  const collections = config.collections;

  /**
   * Create a context object
   */
  function createContext(partial: Partial<OrmContext> = {}): OrmContext {
    const ctx: OrmContext = {
      requestId: partial.requestId || nanoid(),
      correlationId: partial.correlationId,
      user: partial.user,
      tenantId: partial.tenantId,
      timestamp: partial.timestamp || new Date(),
      ip: partial.ip,
      userAgent: partial.userAgent,
      session: partial.session,
      ...partial,
    };

    // Convert tenantId to ObjectId if provided
    if (ctx.tenantId && typeof ctx.tenantId === 'string') {
      try {
        ctx.tenantIdObjectId = new ObjectId(ctx.tenantId);
      } catch (e) {
        // If it's not a valid ObjectId, leave it as string
      }
    }

    return ctx;
  }

  /**
   * Get a context-bound database facade
   */
  function withContext(ctx: OrmContext): DbFacade<TCollections> {
    // Create a proxy that dynamically creates collection facades
    return new Proxy({} as any, {
      get(_target, collectionName: string) {
        // Access collection directly from config to preserve exact types
        const collectionDef = config.collections[collectionName];
        if (!collectionDef) {
          throw new Error(`Collection '${collectionName}' not found in ORM`);
        }

        // Create and return a CollectionFacade for this collection
        return new CollectionFacade(db, collectionDef, ctx, {
          reverseEmbedRegistry,
          deleteRegistry,
        });
      },
    }) as DbFacade<TCollections>;
  }

  /**
   * Transaction helper
   */
  const tx: TransactionHelper = async (_ctx, fn) => {
    const session = client.startSession();
    try {
      return await session.withTransaction(async () => {
        // const txCtx = { ...ctx, session };
        const txOrm = {
          withContext: (_ctx: OrmContext) => withContext(_ctx),
        };
        return await fn(txOrm as any);
      });
    } finally {
      await session.endSession();
    }
  };

  /**
   * Get raw MongoDB client
   */
  function rawClient(): MongoClient {
    return client;
  }

  /**
   * Close the ORM connection
   * Only closes the client if it was created by this ORM instance
   */
  async function close(): Promise<void> {
    if (clientOwned) {
      await client.close();
    }
  }

  return {
    createContext,
    withContext,
    tx,
    rawClient,
    close,
    collections,
  };
}

/**
 * Create a Mizzle database instance
 *
 * @param config - Mizzle configuration
 * @returns Callable database instance with schema, client, and transaction helpers
 *
 * @example
 * ```ts
 * const schema = defineSchema({ users, posts });
 * const db = await mizzle({
 *   uri: process.env.MONGO_URI!,
 *   dbName: 'myapp',
 *   schema,
 * });
 *
 * // Use with context - db is callable!
 * const user = await db({ user, tenantId }).users.findOne({ email: 'alice@example.com' });
 *
 * // Access utilities
 * db.schema.users  // Collection metadata
 * db.client        // Raw MongoClient
 * await db.close() // Cleanup
 *
 * // Transactions
 * await db.tx({}, async (txDb) => {
 *   await txDb({}).users.create({ name: 'Bob' });
 * });
 * ```
 */
export async function mizzle<TSchema extends Record<string, any>>(
  config: MizzleConfig<TSchema>,
): Promise<Mizzle<TSchema>> {
  // Convert MizzleConfig to OrmConfig
  const ormConfig: OrmConfig<TSchema> = {
    uri: config.uri,
    dbName: config.dbName,
    collections: config.schema, // Map schema -> collections internally
    middlewares: config.middlewares,
    validation: config.validation,
    audit: config.audit,
    devGuardrails: config.devGuardrails,
    client: config.client,
    clientOptions: config.clientOptions,
  };

  // Create the underlying ORM
  const orm = await createMongoOrm(ormConfig);

  // Create the callable function - db({ context })
  const dbFunction = (ctx?: Partial<OrmContext>) => {
    const fullContext = orm.createContext(ctx || {});
    return orm.withContext(fullContext);
  };

  // Wrap the tx method to create callable transaction interface
  const wrappedTx: MizzleTransactionHelper<TSchema> = async (ctx, fn) => {
    return orm.tx(ctx, async (txOrm) => {
      // Create a callable function for the transaction ORM
      const txDbFunction = (txCtx?: Partial<OrmContext>) => {
        const fullTxContext = orm.createContext(txCtx || {});
        return txOrm.withContext(fullTxContext);
      };
      return fn(txDbFunction as any);
    });
  };

  // Attach properties to make it both callable and an object
  (dbFunction as any).schema = config.schema;
  (dbFunction as any).client = orm.rawClient();
  (dbFunction as any).tx = wrappedTx;
  (dbFunction as any).close = orm.close.bind(orm);
  (dbFunction as any)._orm = orm;

  return dbFunction as Mizzle<TSchema>;
}

