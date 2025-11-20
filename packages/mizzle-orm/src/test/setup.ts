/**
 * Test setup utilities for MongoDB Memory Server
 */

import { MongoClient, Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMongoOrm } from '../orm/orm';
import type { MongoOrm } from '../types/orm';
import type { CollectionDefinition } from '../types/collection';

let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;
let db: Db;

/**
 * Start MongoDB Memory Server and connect
 */
export async function setupTestDb(): Promise<{ client: MongoClient; db: Db; uri: string }> {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  mongoClient = new MongoClient(uri);
  await mongoClient.connect();

  db = mongoClient.db('test');

  return { client: mongoClient, db, uri };
}

/**
 * Cleanup: disconnect and stop server
 */
export async function teardownTestDb(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Clear all collections in the test database
 */
export async function clearTestDb(): Promise<void> {
  if (!db) return;

  const collections = await db.listCollections().toArray();
  await Promise.all(
    collections.map((collection) => db.collection(collection.name).deleteMany({}))
  );
}

/**
 * Create a test ORM instance with given collections
 */
export async function createTestOrm<T extends CollectionDefinition<any>[]>(
  collections: T,
): Promise<MongoOrm<any>> {
  const { uri } = await setupTestDb();
  return createMongoOrm({
    uri,
    dbName: 'test',
    collections: collections as any,
  });
}
