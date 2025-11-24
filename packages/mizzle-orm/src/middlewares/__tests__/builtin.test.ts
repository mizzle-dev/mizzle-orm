/**
 * Tests for built-in middlewares
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mizzle, defineSchema, mongoCollection } from '../../index.js';
import { string, objectId as objectIdField } from '../../schema/fields.js';
import {
  loggingMiddleware,
  performanceMiddleware,
  cachingMiddleware,
  auditMiddleware,
  retryMiddleware,
  validationMiddleware,
  MemoryCacheStore,
  ValidationError,
  compose,
  when,
  onOperations,
  onReads,
  onWrites,
} from '../index.js';
import type { AuditLogEntry, CacheStore } from '../index.js';

describe('Built-in Middlewares', () => {
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

  describe('loggingMiddleware', () => {
    it('should log operations with custom logger', async () => {
      const logs: string[] = [];
      const customLogger = {
        debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
        info: (msg: string) => logs.push(`INFO: ${msg}`),
        warn: (msg: string) => logs.push(`WARN: ${msg}`),
        error: (msg: string) => logs.push(`ERROR: ${msg}`),
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
        middlewares: [loggingMiddleware({ logger: customLogger, level: 'info' })],
        client,
      });

      await db().users.create({ name: 'Alice' });

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((log) => log.includes('users.create'))).toBe(true);

      await db.close();
    });

    it('should include timing information when enabled', async () => {
      const logs: string[] = [];
      const customLogger = {
        debug: (msg: string) => logs.push(msg),
        info: (msg: string) => logs.push(msg),
        warn: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
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
        middlewares: [
          loggingMiddleware({
            logger: customLogger,
            includeTimings: true,
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });

      expect(logs.some((log) => log.includes('ms'))).toBe(true);

      await db.close();
    });
  });

  describe('performanceMiddleware', () => {
    it('should detect slow queries', async () => {
      let slowQueryDetected = false;
      let duration = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          performanceMiddleware({
            slowQueryThreshold: 0, // Everything is slow
            onSlowQuery: (d) => {
              slowQueryDetected = true;
              duration = d;
            },
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });

      expect(slowQueryDetected).toBe(true);
      expect(duration).toBeGreaterThan(0);

      await db.close();
    });

    it('should call onQueryComplete for all queries', async () => {
      let queryCount = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          performanceMiddleware({
            onQueryComplete: () => {
              queryCount++;
            },
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });
      await db().users.findMany();
      await db().users.count();

      expect(queryCount).toBe(3);

      await db.close();
    });
  });

  describe('cachingMiddleware', () => {
    it('should cache read operations', async () => {
      const cache = new MemoryCacheStore();
      let dbCallCount = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          cachingMiddleware({ store: cache, ttl: 60 }),
          async (ctx, next) => {
            dbCallCount++;
            return next();
          },
        ],
        client,
      });

      // Create a user
      await db().users.create({ name: 'Alice' });

      // First findMany - should hit database
      const result1 = await db().users.findMany();
      expect(dbCallCount).toBe(2); // 1 for create, 1 for findMany

      // Second findMany - should hit cache
      const result2 = await db().users.findMany();
      expect(dbCallCount).toBe(2); // No additional DB call

      expect(result1).toEqual(result2);

      await db.close();
    });

    it('should not cache write operations', async () => {
      const cache = new MemoryCacheStore();
      let dbCallCount = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          cachingMiddleware({ store: cache }),
          async (ctx, next) => {
            dbCallCount++;
            return next();
          },
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });
      await db().users.create({ name: 'Bob' });

      expect(dbCallCount).toBe(2); // Both create operations hit DB

      await db.close();
    });

    it('should use custom key generator', async () => {
      const cache = new MemoryCacheStore();
      const generatedKeys: string[] = [];

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          cachingMiddleware({
            store: cache,
            keyGenerator: (ctx) => {
              const key = `custom:${ctx.collection}:${ctx.operation}`;
              generatedKeys.push(key);
              return key;
            },
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });
      await db().users.findMany();

      expect(generatedKeys).toContain('custom:users:findMany');

      await db.close();
    });
  });

  describe('auditMiddleware', () => {
    it('should log write operations', async () => {
      const auditLog: AuditLogEntry[] = [];

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          auditMiddleware({
            store: {
              log: async (entry) => {
                auditLog.push(entry);
              },
            },
            includeReads: false,
          }),
        ],
        client,
      });

      await db({ user: { id: 'user_123' } }).users.create({ name: 'Alice' });
      await db().users.findMany(); // Should not be audited

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].collection).toBe('users');
      expect(auditLog[0].operation).toBe('create');
      expect(auditLog[0].user).toEqual({ id: 'user_123' });

      await db.close();
    });

    it('should log read operations when includeReads is true', async () => {
      const auditLog: AuditLogEntry[] = [];

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          auditMiddleware({
            store: {
              log: async (entry) => {
                auditLog.push(entry);
              },
            },
            includeReads: true,
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });
      await db().users.findMany();

      expect(auditLog.length).toBe(2);
      expect(auditLog[0].operation).toBe('create');
      expect(auditLog[1].operation).toBe('findMany');

      await db.close();
    });

    it('should transform audit entries', async () => {
      const auditLog: AuditLogEntry[] = [];

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          auditMiddleware({
            store: {
              log: async (entry) => {
                auditLog.push(entry);
              },
            },
            transformEntry: (entry) => ({
              ...entry,
              metadata: { ...entry.metadata, environment: 'test' },
            }),
          }),
        ],
        client,
      });

      await db().users.create({ name: 'Alice' });

      expect(auditLog[0].metadata).toEqual({ environment: 'test' });

      await db.close();
    });
  });

  describe('retryMiddleware', () => {
    it('should retry on transient errors', async () => {
      let attemptCount = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          retryMiddleware({
            maxRetries: 2,
            backoff: () => 10, // Fast retry for testing
            retryIf: (error) => error.message.includes('transient'),
          }),
          async (ctx, next) => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('transient error');
            }
            return next();
          },
        ],
        client,
      });

      await db().users.findMany();

      expect(attemptCount).toBe(3); // Initial + 2 retries

      await db.close();
    });

    it('should not retry on non-transient errors', async () => {
      let attemptCount = 0;

      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          retryMiddleware({
            maxRetries: 2,
            retryIf: (error) => error.message.includes('transient'),
          }),
          async (ctx, next) => {
            attemptCount++;
            throw new Error('permanent error');
          },
        ],
        client,
      });

      await expect(db().users.findMany()).rejects.toThrow('permanent error');
      expect(attemptCount).toBe(1); // No retries

      await db.close();
    });
  });

  describe('validationMiddleware', () => {
    it('should validate data before create operations', async () => {
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
          validationMiddleware({
            validator: (data, operation) => {
              if (operation === 'create') {
                if (!data.email || !data.email.includes('@')) {
                  return { valid: false, errors: ['Invalid email'] };
                }
              }
              return { valid: true };
            },
          }),
        ],
        client,
      });

      // Valid email
      await expect(db().users.create({ name: 'Alice', email: 'alice@example.com' })).resolves.toBeDefined();

      // Invalid email
      await expect(db().users.create({ name: 'Bob', email: 'invalid' } as any)).rejects.toThrow(
        ValidationError,
      );

      await db.close();
    });

    it('should include error messages in ValidationError', async () => {
      const users = mongoCollection('users', {
        _id: objectIdField().internalId(),
        name: string(),
      });

      const schema = defineSchema({ users });
      const db = await mizzle({
        uri,
        dbName: 'test',
        schema,
        middlewares: [
          validationMiddleware({
            validator: () => ({
              valid: false,
              errors: ['Error 1', 'Error 2'],
            }),
          }),
        ],
        client,
      });

      try {
        await db().users.create({ name: 'Alice' });
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).errors).toEqual(['Error 1', 'Error 2']);
      }

      await db.close();
    });
  });

  describe('Composition Utilities', () => {
    describe('compose', () => {
      it('should combine multiple middlewares', async () => {
        const order: string[] = [];

        const mw1 = async (ctx: any, next: any) => {
          order.push('1-before');
          const result = await next();
          order.push('1-after');
          return result;
        };

        const mw2 = async (ctx: any, next: any) => {
          order.push('2-before');
          const result = await next();
          order.push('2-after');
          return result;
        };

        const combined = compose(mw1, mw2);

        const users = mongoCollection('users', {
          _id: objectIdField().internalId(),
          name: string(),
        });

        const schema = defineSchema({ users });
        const db = await mizzle({
          uri,
          dbName: 'test',
          schema,
          middlewares: [combined],
          client,
        });

        await db().users.create({ name: 'Alice' });

        expect(order).toEqual(['1-before', '2-before', '2-after', '1-after']);

        await db.close();
      });
    });

    describe('when', () => {
      it('should conditionally apply middleware', async () => {
        let executedForCreate = false;
        let executedForFind = false;

        const conditionalMiddleware = when(
          (ctx) => ctx.operation === 'create',
          async (ctx, next) => {
            executedForCreate = true;
            return next();
          },
        );

        const users = mongoCollection('users', {
          _id: objectIdField().internalId(),
          name: string(),
        });

        const schema = defineSchema({ users });
        const db = await mizzle({
          uri,
          dbName: 'test',
          schema,
          middlewares: [conditionalMiddleware],
          client,
        });

        await db().users.create({ name: 'Alice' });
        expect(executedForCreate).toBe(true);

        await db().users.findMany();
        expect(executedForFind).toBe(false);

        await db.close();
      });
    });

    describe('onOperations', () => {
      it('should only run on specified operations', async () => {
        const executedOperations: string[] = [];

        const users = mongoCollection('users', {
          _id: objectIdField().internalId(),
          name: string(),
        });

        const schema = defineSchema({ users });
        const db = await mizzle({
          uri,
          dbName: 'test',
          schema,
          middlewares: [
            onOperations(['create', 'update'], async (ctx, next) => {
              executedOperations.push(ctx.operation);
              return next();
            }),
          ],
          client,
        });

        const user = await db().users.create({ name: 'Alice' });
        await db().users.updateById(user._id, { name: 'Bob' });
        await db().users.findMany();

        expect(executedOperations).toEqual(['create', 'updateById']);

        await db.close();
      });
    });

    describe('onReads', () => {
      it('should only run on read operations', async () => {
        let readCount = 0;

        const users = mongoCollection('users', {
          _id: objectIdField().internalId(),
          name: string(),
        });

        const schema = defineSchema({ users });
        const db = await mizzle({
          uri,
          dbName: 'test',
          schema,
          middlewares: [
            onReads(async (ctx, next) => {
              readCount++;
              return next();
            }),
          ],
          client,
        });

        await db().users.create({ name: 'Alice' });
        await db().users.findMany();
        await db().users.count();

        expect(readCount).toBe(2); // findMany + count

        await db.close();
      });
    });

    describe('onWrites', () => {
      it('should only run on write operations', async () => {
        let writeCount = 0;

        const users = mongoCollection('users', {
          _id: objectIdField().internalId(),
          name: string(),
        });

        const schema = defineSchema({ users });
        const db = await mizzle({
          uri,
          dbName: 'test',
          schema,
          middlewares: [
            onWrites(async (ctx, next) => {
              writeCount++;
              return next();
            }),
          ],
          client,
        });

        const user = await db().users.create({ name: 'Alice' });
        await db().users.findMany();
        await db().users.updateById(user._id, { name: 'Bob' });

        expect(writeCount).toBe(2); // create + updateById

        await db.close();
      });
    });
  });
});
