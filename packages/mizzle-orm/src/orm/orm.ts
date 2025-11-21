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
  // Map both by object key (for db.users access) and by collection name (for internal lookups)
  const collectionRegistry = new Map<string, CollectionDefinition>();
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
      if (relation.type === 'embed' && (relation as any).forward) {
        const embedRelation = relation as any;
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
      if (relation.type === 'embed' && (relation as any).forward) {
        const embedRelation = relation as any;
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
        const collectionDef = collectionRegistry.get(collectionName);
        if (!collectionDef) {
          throw new Error(`Collection '${collectionName}' not found in ORM`);
        }

        // Create and return a CollectionFacade for this collection
        return new CollectionFacade(db, collectionDef, ctx, {
          reverseEmbedRegistry,
          collectionRegistry,
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

