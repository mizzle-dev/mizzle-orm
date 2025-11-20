/**
 * Lifecycle hooks tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, number } from '../../schema/fields';
import type { MongoOrm } from '../../types/orm';

describe('Hooks', () => {
  let orm: MongoOrm;
  const hookCalls: string[] = [];

  // Test collection with hooks
  const products = mongoCollection(
    'products',
    {
      name: string(),
      price: number(),
      slug: string().optional(),
    },
    {
      hooks: {
        beforeInsert: async (ctx, doc) => {
          hookCalls.push('beforeInsert');
          // Auto-generate slug from name
          return {
            ...doc,
            slug: doc.name.toLowerCase().replace(/\s+/g, '-'),
          };
        },
        afterInsert: async (ctx, doc) => {
          hookCalls.push('afterInsert');
        },
        beforeUpdate: async (ctx, oldDoc, newDoc) => {
          hookCalls.push('beforeUpdate');
          // Update slug if name changed
          if (newDoc.name && newDoc.name !== oldDoc.name) {
            return {
              ...newDoc,
              slug: newDoc.name.toLowerCase().replace(/\s+/g, '-'),
            };
          }
          return newDoc;
        },
        afterUpdate: async (ctx, oldDoc, newDoc) => {
          hookCalls.push('afterUpdate');
        },
        beforeDelete: async (ctx, doc) => {
          hookCalls.push('beforeDelete');
        },
        afterDelete: async (ctx, doc) => {
          hookCalls.push('afterDelete');
        },
      },
    }
  );

  beforeAll(async () => {
    orm = await createTestOrm([products]);
  });

  afterAll(async () => {
    await orm.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    hookCalls.length = 0; // Clear hook calls
  });

  describe('beforeInsert / afterInsert', () => {
    it('should run before and after insert hooks', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      await db.products.create({ name: 'Test Product', price: 99 });

      expect(hookCalls).toEqual(['beforeInsert', 'afterInsert']);
    });

    it('should allow beforeInsert to transform document', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const product = await db.products.create({
        name: 'Amazing Product',
        price: 199,
      });

      expect(product.slug).toBe('amazing-product');
    });
  });

  describe('beforeUpdate / afterUpdate', () => {
    it('should run before and after update hooks', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const product = await db.products.create({
        name: 'Original',
        price: 50,
      });

      hookCalls.length = 0; // Clear create hooks

      await db.products.updateById(product._id, { price: 75 });

      expect(hookCalls).toEqual(['beforeUpdate', 'afterUpdate']);
    });

    it('should allow beforeUpdate to transform document', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const product = await db.products.create({
        name: 'Original Name',
        price: 50,
      });

      const updated = await db.products.updateById(product._id, {
        name: 'New Name',
      });

      expect(updated?.slug).toBe('new-name');
    });
  });

  describe('beforeDelete / afterDelete', () => {
    it('should run before and after delete hooks', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const product = await db.products.create({
        name: 'To Delete',
        price: 100,
      });

      hookCalls.length = 0; // Clear create hooks

      await db.products.deleteById(product._id);

      expect(hookCalls).toEqual(['beforeDelete', 'afterDelete']);
    });
  });

  describe('hook execution order', () => {
    it('should execute hooks in correct order for full lifecycle', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create
      const product = await db.products.create({
        name: 'Lifecycle Test',
        price: 123,
      });
      expect(hookCalls).toEqual(['beforeInsert', 'afterInsert']);

      hookCalls.length = 0;

      // Update
      await db.products.updateById(product._id, { price: 456 });
      expect(hookCalls).toEqual(['beforeUpdate', 'afterUpdate']);

      hookCalls.length = 0;

      // Delete
      await db.products.deleteById(product._id);
      expect(hookCalls).toEqual(['beforeDelete', 'afterDelete']);
    });
  });
});
