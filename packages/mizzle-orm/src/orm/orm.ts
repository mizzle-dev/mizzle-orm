/**
 * Main ORM implementation
 */

import { MongoClient } from 'mongodb';
import type { OrmConfig, OrmContext, MongoOrm, DbFacade, TransactionHelper } from '../types/orm';
import type { CollectionDefinition } from '../types/collection';
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
export function defineCollections<T extends Record<string, CollectionDefinition<any>>>(
  collections: T,
): T {
  return collections;
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
export async function createMongoOrm<TCollections extends Record<string, CollectionDefinition<any>>>(
  config: OrmConfig<TCollections>,
): Promise<MongoOrm<TCollections>> {
  // Connect to MongoDB
  const client = new MongoClient(config.uri, config.clientOptions);
  await client.connect();

  // Get database instance
  const db = client.db(config.dbName);

  // Build collection registry from the collections object
  const collectionRegistry = new Map<string, CollectionDefinition>();
  for (const [_, collectionDef] of Object.entries(config.collections)) {
    collectionRegistry.set(collectionDef._meta.name, collectionDef);
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
        const collectionDef = collectionRegistry.get(collectionName);
        if (!collectionDef) {
          throw new Error(`Collection '${collectionName}' not found in ORM`);
        }

        // Create and return a CollectionFacade for this collection
        return new CollectionFacade(db, collectionDef, ctx);
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
   */
  async function close(): Promise<void> {
    await client.close();
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

