/**
 * Tests for middleware execution and type preservation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mizzle, defineSchema, mongoCollection } from '../../index.js';
import { string, objectId as objectIdField } from '../../schema/fields.js';
import type { Middleware } from '../../types/middleware.js';

describe('Middleware System', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let uri: string;

  beforeEach(async () => {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
  });

  afterEach(async () => {
    await client.close();
    await mongod.stop();
  });

  describe('Execution Order', () => {
    it('should execute middlewares in correct order (global -> collection -> operation)', async () => {
      const executionLog: string[] = [];

      const globalMiddleware1: Middleware = async (ctx, next) => {
        executionLog.push('global1-before');
        const result = await next();
        executionLog.push('global1-after');
        return result;
      };

      const globalMiddleware2: Middleware = async (ctx, next) => {
        executionLog.push('global2-before');
        const result = await next();
        executionLog.push('global2-after');
        return result;
      };

      const collectionMiddleware: Middleware = async (ctx, next) => {
        executionLog.push('collection-before');
        const result = await next();
        executionLog.push('collection-after');
        return result;
      };

      const users = mongoCollection(
        'users',
        {
          _id: objectIdField().internalId(),
          name: string(),
        },
        {
          middlewares: [collectionMiddleware],
        },
      );

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [globalMiddleware1, globalMiddleware2],
        client,
      });

      await db().users.create({ name: 'Alice' });

      // Verify execution order: global1 -> global2 -> collection -> operation -> collection -> global2 -> global1
      expect(executionLog).toEqual([
        'global1-before',
        'global2-before',
        'collection-before',
        'collection-after',
        'global2-after',
        'global1-after',
      ]);

      await db.close();
    });

    it('should execute multiple global middlewares in order', async () => {
      const order: number[] = [];

      const middleware1: Middleware = async (ctx, next) => {
        order.push(1);
        const result = await next();
        order.push(-1);
        return result;
      };

      const middleware2: Middleware = async (ctx, next) => {
        order.push(2);
        const result = await next();
        order.push(-2);
        return result;
      };

      const middleware3: Middleware = async (ctx, next) => {
        order.push(3);
        const result = await next();
        order.push(-3);
        return result;
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [middleware1, middleware2, middleware3],
        client,
      });

      await db().users.findMany();

      expect(order).toEqual([1, 2, 3, -3, -2, -1]);

      await db.close();
    });
  });

  describe('Type Preservation', () => {
    it('should preserve return types through middleware chain', async () => {
      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
        email: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          async (ctx, next) => next(), // Pass-through middleware
        ],
        client,
      });

      // Create
      const user = await db().users.create({ name: 'Alice', email: 'alice@example.com' });
      expect(user).toHaveProperty('_id');
      expect(user).toHaveProperty('name', 'Alice');

      // FindOne
      const found = await db().users.findOne({ name: 'Alice' });
      expect(found).toHaveProperty('name', 'Alice');

      // FindMany
      const users$ = await db().users.findMany();
      expect(Array.isArray(users$)).toBe(true);
      expect(users$[0]).toHaveProperty('name', 'Alice');

      // Count
      const count = await db().users.count();
      expect(typeof count).toBe('number');
      expect(count).toBe(1);

      // Update
      const updated = await db().users.updateById(user._id, { name: 'Bob' });
      expect(updated).toHaveProperty('name', 'Bob');

      // Delete
      const deleted = await db().users.deleteById(user._id);
      expect(typeof deleted).toBe('boolean');
      expect(deleted).toBe(true);

      await db.close();
    });
  });

  describe('Context Access', () => {
    it('should provide correct context to middlewares', async () => {
      let capturedContext: any;

      const contextCapturingMiddleware: Middleware = async (ctx, next) => {
        capturedContext = { ...ctx };
        return next();
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [contextCapturingMiddleware],
        client,
      });

      await db({ user: { id: 'user_123', roles: ['admin'] } }).users.create({ name: 'Alice' });

      expect(capturedContext).toBeDefined();
      expect(capturedContext.collection).toBe('users');
      expect(capturedContext.operation).toBe('create');
      expect(capturedContext.orm).toBeDefined();
      expect(capturedContext.orm.user).toEqual({ id: 'user_123', roles: ['admin'] });
      expect(capturedContext.collectionDef).toBeDefined();
      expect(capturedContext.startedAt).toBeTypeOf('number');

      await db.close();
    });

    it('should pass filter and options to middleware context', async () => {
      let capturedFilter: any;
      let capturedOptions: any;

      const middleware: Middleware = async (ctx, next) => {
        capturedFilter = ctx.filter;
        capturedOptions = ctx.options;
        return next();
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [middleware],
        client,
      });

      await db().users.create({ name: 'Alice' });
      await db().users.findMany({ name: 'Alice' }, { limit: 10, sort: { name: 1 } });

      expect(capturedFilter).toEqual({ name: 'Alice' });
      expect(capturedOptions).toEqual({ limit: 10, sort: { name: 1 } });

      await db.close();
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors through middleware chain', async () => {
      const middleware: Middleware = async (ctx, next) => {
        try {
          return await next();
        } catch (error) {
          throw error;
        }
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [middleware],
        client,
      });

      // Try to update non-existent document
      const result = await db().users.updateById(new ObjectId(), { name: 'Bob' });
      expect(result).toBeNull();

      await db.close();
    });

    it('should allow middleware to catch and transform errors', async () => {
      const errorTransformMiddleware: Middleware = async (ctx, next) => {
        try {
          return await next();
        } catch (error) {
          throw new Error(`[Middleware] Operation ${ctx.operation} failed`);
        }
      };

      const throwingMiddleware: Middleware = async (ctx, next) => {
        throw new Error('Original error');
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [errorTransformMiddleware, throwingMiddleware],
        client,
      });

      await expect(db().users.findMany()).rejects.toThrow('[Middleware] Operation findMany failed');

      await db.close();
    });
  });

  describe('Middleware Modification', () => {
    it('should allow middleware to modify context metadata', async () => {
      const metadataMiddleware: Middleware = async (ctx, next) => {
        ctx.metadata = ctx.metadata || {};
        ctx.metadata.processedBy = 'metadataMiddleware';
        return next();
      };

      let capturedMetadata: any;
      const captureMiddleware: Middleware = async (ctx, next) => {
        const result = await next();
        capturedMetadata = ctx.metadata;
        return result;
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [metadataMiddleware, captureMiddleware],
        client,
      });

      await db().users.create({ name: 'Alice' });

      expect(capturedMetadata).toEqual({ processedBy: 'metadataMiddleware' });

      await db.close();
    });
  });

  describe('Performance', () => {
    it('should have minimal overhead when no middlewares are configured', async () => {
      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        client,
      });

      const start = performance.now();
      await db().users.create({ name: 'Alice' });
      const duration = performance.now() - start;

      // Should complete quickly (< 100ms on typical hardware)
      expect(duration).toBeLessThan(100);

      await db.close();
    });

    it('should execute quickly with empty pass-through middlewares', async () => {
      const passThrough: Middleware = async (ctx, next) => next();

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [passThrough, passThrough, passThrough],
        client,
      });

      const start = performance.now();
      await db().users.create({ name: 'Alice' });
      const duration = performance.now() - start;

      // Should have minimal overhead (< 110ms)
      expect(duration).toBeLessThan(110);

      await db.close();
    });
  });

  describe('All Operations', () => {
    it('should run middlewares for all CRUD operations', async () => {
      const operations: string[] = [];

      const trackingMiddleware: Middleware = async (ctx, next) => {
        operations.push(ctx.operation);
        return next();
      };

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [trackingMiddleware],
        client,
      });

      // Create
      const user = await db().users.create({ name: 'Alice' });
      // FindOne
      await db().users.findOne({ _id: user._id });
      // FindById
      await db().users.findById(user._id);
      // FindMany
      await db().users.findMany();
      // Count
      await db().users.count();
      // Update
      await db().users.updateById(user._id, { name: 'Bob' });
      // Delete
      await db().users.deleteById(user._id);

      expect(operations).toEqual(['create', 'findOne', 'findById', 'findMany', 'count', 'updateById', 'delete']);

      await db.close();
    });
  });
});
