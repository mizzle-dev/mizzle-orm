/**
 * Test setup utilities for MongoDB Memory Server
 */

import { MongoClient, Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMongoOrm } from '../orm/orm';
import type { MongoOrm } from '../types/orm';

let mongoServer: MongoMemoryServer | null = null;
let mongoClient: MongoClient | null = null;
let db: Db | null = null;
let testOrms: MongoOrm<any>[] = [];

/**
 * Start MongoDB Memory Server and connect (called once per test file)
 */
export async function setupTestDb(): Promise<{ client: MongoClient; db: Db; uri: string }> {
  // Reuse existing server if already created
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
  }

  const uri = mongoServer.getUri();

  // Reuse existing client if already connected
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test');
  }

  return { client: mongoClient, db: db!, uri };
}

/**
 * Cleanup: disconnect and stop server
 */
export async function teardownTestDb(): Promise<void> {
  // Close all ORMs created during tests
  for (const orm of testOrms) {
    try {
      await orm.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
  testOrms = [];

  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    db = null;
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

/**
 * Clear all collections in the test database
 */
export async function clearTestDb(): Promise<void> {
  if (!db) {
    // Initialize if not already set up
    await setupTestDb();
  }

  if (!db) return;

  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map((collection) => db!.collection(collection.name).deleteMany({}))
  );
}

/**
 * Create a test ORM instance with given collections
 * Pass a record of collections directly for best type inference
 */
export async function createTestOrm<TCollections extends Record<string, any>>(
  collections: TCollections,
): Promise<MongoOrm<TCollections>> {
  const { uri } = await setupTestDb();

  const orm = await createMongoOrm({
    uri,
    dbName: 'test',
    collections,
  });

  // Track the ORM for cleanup
  testOrms.push(orm);

  return orm;
}
