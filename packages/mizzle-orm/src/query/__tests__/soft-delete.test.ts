/**
 * Soft delete tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, date } from '../../schema/fields';
import type { MongoOrm } from '../../types/orm';

describe('Soft Delete', () => {
  let orm: MongoOrm;

  // Test collection with soft delete
  const tasks = mongoCollection('tasks', {
    title: string(),
    completed: date().optional(),
    deletedAt: date().softDeleteFlag().optional(),
  });

  beforeAll(async () => {
    orm = await createTestOrm({ tasks });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('softDelete()', () => {
    it('should soft delete a document by setting deletedAt', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Task to soft delete' });

      const deleted = await db.tasks.softDelete(task._id);

      expect(deleted?.deletedAt).toBeInstanceOf(Date);
      expect(deleted?.title).toBe('Task to soft delete');
    });

    it('should not actually remove the document', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Task' });

      await db.tasks.softDelete(task._id);

      // Access raw collection to verify it still exists
      const raw = db.tasks.rawCollection();
      const doc = await raw.findOne({ _id: task._id });
      expect(doc).not.toBeNull();
      expect(doc?.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore()', () => {
    it('should restore a soft-deleted document', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Task to restore' });
      await db.tasks.softDelete(task._id);

      const restored = await db.tasks.restore(task._id);

      expect(restored?.deletedAt).toBeNull();
      expect(restored?.title).toBe('Task to restore');
    });
  });

  describe('soft delete with queries', () => {
    it('should allow finding soft-deleted documents via raw collection', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Deleted Task' });
      await db.tasks.softDelete(task._id);

      const raw = db.tasks.rawCollection();
      const found = await raw.findOne({ _id: task._id });

      expect(found).not.toBeNull();
      expect(found?.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('hard delete vs soft delete', () => {
    it('should actually remove document with deleteById', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Hard delete task' });

      await db.tasks.deleteById(task._id);

      const raw = db.tasks.rawCollection();
      const found = await raw.findOne({ _id: task._id });
      expect(found).toBeNull();
    });

    it('should preserve document with softDelete', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const task = await db.tasks.create({ title: 'Soft delete task' });

      await db.tasks.softDelete(task._id);

      const raw = db.tasks.rawCollection();
      const found = await raw.findOne({ _id: task._id });
      expect(found).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw error if soft delete not configured', async () => {
      const noSoftDelete = mongoCollection('no_soft_delete', {
        name: string(),
      });

      const testOrm = await createTestOrm({ noSoftDelete });
      const ctx = testOrm.createContext({});
      const db = testOrm.withContext(ctx);

      const doc = await db.noSoftDelete.create({ name: 'Test' });

      await expect(db.noSoftDelete.softDelete(doc._id)).rejects.toThrow(
        'Soft delete not configured for this collection'
      );
    });
  });
});
