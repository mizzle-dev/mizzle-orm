/**
 * Tests for softDelete support in Standard Schema collections
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { fromStandardSchema } from '../from-standard-schema';

describe('Standard Schema Soft Delete', () => {
  describe('fromStandardSchema options', () => {
    it('should accept softDelete: true option', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_soft_delete_users', userSchema, {
        softDelete: true,
      });

      expect(users._meta.options.softDelete).toBe(true);
      expect(users._meta.softDeleteConfig).toEqual({
        field: 'deletedAt',
      });
    });

    it('should accept softDelete: { field: "customField" } option', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_soft_delete_users2', userSchema, {
        softDelete: { field: 'removedAt' },
      });

      expect(users._meta.options.softDelete).toEqual({ field: 'removedAt' });
      expect(users._meta.softDeleteConfig).toEqual({
        field: 'removedAt',
      });
    });

    it('should use default field name "deletedAt" when field not specified in object form', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_soft_delete_users3', userSchema, {
        softDelete: { field: undefined },
      });

      expect(users._meta.softDeleteConfig).toEqual({
        field: 'deletedAt',
      });
    });

    it('should not have softDeleteConfig when softDelete not enabled', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_soft_delete_users4', userSchema);

      expect(users._meta.softDeleteConfig).toBeUndefined();
    });
  });

  describe('softDelete() and restore() operations', () => {
    let db: any;

    const itemSchema = z.object({
      name: z.string(),
      category: z.string().optional(),
    });

    const items = fromStandardSchema('ss_soft_delete_items', itemSchema, {
      softDelete: true,
    });

    beforeAll(async () => {
      db = await createTestOrm({ items });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should soft delete a document by setting deletedAt timestamp', async () => {
      const item = await db().items.create({ name: 'Test Item', category: 'test' });

      const deleted = await db().items.softDelete(item._id);

      expect(deleted).not.toBeNull();
      expect(deleted.deletedAt).toBeInstanceOf(Date);
      expect(deleted.name).toBe('Test Item');

      // Document still exists in database
      const raw = db().items.rawCollection();
      const doc = await raw.findOne({ _id: item._id });
      expect(doc).not.toBeNull();
      expect(doc.deletedAt).toBeInstanceOf(Date);
    });

    it('should restore a soft-deleted document by clearing deletedAt', async () => {
      const item = await db().items.create({ name: 'Test Item' });
      await db().items.softDelete(item._id);

      const restored = await db().items.restore(item._id);

      expect(restored).not.toBeNull();
      expect(restored.deletedAt).toBeNull();
      expect(restored.name).toBe('Test Item');
    });

    it('should throw error when softDelete not configured', async () => {
      const noSoftDeleteSchema = z.object({ title: z.string() });
      const noSoftDelete = fromStandardSchema('ss_no_soft_delete', noSoftDeleteSchema);

      const testDb = await createTestOrm({ noSoftDelete });
      const doc = await testDb().noSoftDelete.create({ title: 'Test' });

      await expect(testDb().noSoftDelete.softDelete(doc._id)).rejects.toThrow(
        'Soft delete not configured for this collection'
      );
    });
  });

  describe('Query filtering', () => {
    let db: any;

    const productSchema = z.object({
      name: z.string(),
      price: z.number(),
    });

    const products = fromStandardSchema('ss_soft_delete_products', productSchema, {
      softDelete: true,
    });

    beforeAll(async () => {
      db = await createTestOrm({ products });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should exclude soft-deleted documents from findMany by default', async () => {
      const product1 = await db().products.create({ name: 'Product 1', price: 10 });
      const product2 = await db().products.create({ name: 'Product 2', price: 20 });
      const product3 = await db().products.create({ name: 'Product 3', price: 30 });

      // Soft delete product2
      await db().products.softDelete(product2._id);

      const results = await db().products.findMany();

      expect(results).toHaveLength(2);
      expect(results.map((p: any) => p.name).sort()).toEqual(['Product 1', 'Product 3']);
    });

    it('should exclude soft-deleted documents from findOne by default', async () => {
      const product = await db().products.create({ name: 'Test Product', price: 100 });
      await db().products.softDelete(product._id);

      const result = await db().products.findOne({ name: 'Test Product' });

      expect(result).toBeNull();
    });

    it('should exclude soft-deleted documents from findById by default', async () => {
      const product = await db().products.create({ name: 'Test Product', price: 100 });
      await db().products.softDelete(product._id);

      const result = await db().products.findById(product._id);

      expect(result).toBeNull();
    });

    it('should exclude soft-deleted documents from count by default', async () => {
      await db().products.create({ name: 'Product 1', price: 10 });
      const product2 = await db().products.create({ name: 'Product 2', price: 20 });
      await db().products.create({ name: 'Product 3', price: 30 });

      await db().products.softDelete(product2._id);

      const count = await db().products.count();

      expect(count).toBe(2);
    });

    it('should allow finding soft-deleted documents via raw collection', async () => {
      const product = await db().products.create({ name: 'Deleted Product', price: 999 });
      await db().products.softDelete(product._id);

      const raw = db().products.rawCollection();
      const found = await raw.findOne({ _id: product._id });

      expect(found).not.toBeNull();
      expect(found.deletedAt).toBeInstanceOf(Date);
      expect(found.name).toBe('Deleted Product');
    });

    it('should include non-deleted documents with null deletedAt', async () => {
      // Test that documents without deletedAt or with null deletedAt are included
      const product1 = await db().products.create({ name: 'Product 1', price: 10 });
      
      // Soft delete and restore to set deletedAt to null
      await db().products.softDelete(product1._id);
      await db().products.restore(product1._id);

      const results = await db().products.findMany();

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Product 1');
    });

    it('should apply filter with soft delete exclusion', async () => {
      await db().products.create({ name: 'Expensive', price: 100 });
      const cheap = await db().products.create({ name: 'Cheap', price: 10 });
      await db().products.create({ name: 'Medium', price: 50 });

      await db().products.softDelete(cheap._id);

      const results = await db().products.findMany({ price: { $lt: 60 } });

      // Only Medium should be returned (Cheap is soft-deleted)
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Medium');
    });
  });

  describe('Custom soft delete field', () => {
    let db: any;

    const taskSchema = z.object({
      title: z.string(),
      priority: z.number().optional(),
    });

    const tasks = fromStandardSchema('ss_soft_delete_tasks', taskSchema, {
      softDelete: { field: 'archivedAt' },
    });

    beforeAll(async () => {
      db = await createTestOrm({ tasks });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should use custom field name for soft delete', async () => {
      const task = await db().tasks.create({ title: 'Test Task', priority: 1 });

      const deleted = await db().tasks.softDelete(task._id);

      expect(deleted.archivedAt).toBeInstanceOf(Date);
      expect(deleted.deletedAt).toBeUndefined();
    });

    it('should exclude documents with custom soft delete field from queries', async () => {
      const task1 = await db().tasks.create({ title: 'Task 1', priority: 1 });
      await db().tasks.create({ title: 'Task 2', priority: 2 });

      await db().tasks.softDelete(task1._id);

      const results = await db().tasks.findMany();

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Task 2');
    });

    it('should restore using custom field', async () => {
      const task = await db().tasks.create({ title: 'Test Task' });
      await db().tasks.softDelete(task._id);

      const restored = await db().tasks.restore(task._id);

      expect(restored.archivedAt).toBeNull();

      // Should be findable again
      const found = await db().tasks.findById(task._id);
      expect(found).not.toBeNull();
      expect(found.title).toBe('Test Task');
    });
  });

  describe('Integration with other features', () => {
    let db: any;

    const entitySchema = z.object({
      name: z.string(),
      type: z.enum(['a', 'b']).default('a'),
    });

    const entities = fromStandardSchema('ss_soft_delete_entities', entitySchema, {
      publicId: 'entity',
      softDelete: true,
    });

    beforeAll(async () => {
      db = await createTestOrm({ entities });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should work with publicId', async () => {
      const entity = await db().entities.create({ name: 'Test Entity' });
      
      expect(entity.id).toMatch(/^entity_/);

      await db().entities.softDelete(entity.id); // Use public ID

      // Should not be findable via public ID
      const notFound = await db().entities.findById(entity.id);
      expect(notFound).toBeNull();

      // Restore via public ID
      await db().entities.restore(entity.id);

      const found = await db().entities.findById(entity.id);
      expect(found).not.toBeNull();
      expect(found.name).toBe('Test Entity');
    });

    it('should preserve validation on soft-deleted documents', async () => {
      const entity = await db().entities.create({ name: 'Entity', type: 'a' });
      await db().entities.softDelete(entity._id);

      // Restore and update - validation should still work
      await db().entities.restore(entity._id);

      // Invalid type should fail
      await expect(
        db().entities.updateById(entity._id, { type: 'invalid' })
      ).rejects.toThrow();
    });
  });

  describe('Hard delete vs soft delete', () => {
    let db: any;

    const recordSchema = z.object({
      data: z.string(),
    });

    const records = fromStandardSchema('ss_soft_delete_records', recordSchema, {
      softDelete: true,
    });

    beforeAll(async () => {
      db = await createTestOrm({ records });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should preserve document with softDelete', async () => {
      const record = await db().records.create({ data: 'important' });

      await db().records.softDelete(record._id);

      // Document still exists
      const raw = db().records.rawCollection();
      const found = await raw.findOne({ _id: record._id });
      expect(found).not.toBeNull();
    });

    it('should actually remove document with deleteById', async () => {
      const record = await db().records.create({ data: 'deleteable' });

      await db().records.deleteById(record._id);

      // Document is gone
      const raw = db().records.rawCollection();
      const found = await raw.findOne({ _id: record._id });
      expect(found).toBeNull();
    });

    it('should allow re-soft-deleting a restored document', async () => {
      const record = await db().records.create({ data: 'test' });

      // Soft delete
      await db().records.softDelete(record._id);
      let found = await db().records.findById(record._id);
      expect(found).toBeNull();

      // Restore
      await db().records.restore(record._id);
      found = await db().records.findById(record._id);
      expect(found).not.toBeNull();

      // Soft delete again
      await db().records.softDelete(record._id);
      found = await db().records.findById(record._id);
      expect(found).toBeNull();
    });
  });
});
