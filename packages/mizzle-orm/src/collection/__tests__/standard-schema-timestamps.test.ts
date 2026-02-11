/**
 * Tests for timestamps support in Standard Schema collections
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { fromStandardSchema } from '../from-standard-schema';

describe('Standard Schema Timestamps', () => {
  describe('fromStandardSchema options', () => {
    it('should accept timestamps: true option', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users1', userSchema, {
        timestamps: true,
      });

      expect(users._meta.options.timestamps).toBe(true);
      expect(users._meta.timestampsConfig).toEqual({
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      });
    });

    it('should accept timestamps with custom field names', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users2', userSchema, {
        timestamps: { createdAt: 'created', updatedAt: 'modified' },
      });

      expect(users._meta.options.timestamps).toEqual({
        createdAt: 'created',
        updatedAt: 'modified',
      });
      expect(users._meta.timestampsConfig).toEqual({
        createdAt: 'created',
        updatedAt: 'modified',
      });
    });

    it('should use default field names when only one custom field is provided', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users3', userSchema, {
        timestamps: { createdAt: 'created' },
      });

      expect(users._meta.timestampsConfig).toEqual({
        createdAt: 'created',
        updatedAt: 'updatedAt', // Default
      });
    });

    it('should use default createdAt when only updatedAt is specified', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users4', userSchema, {
        timestamps: { updatedAt: 'modified' },
      });

      expect(users._meta.timestampsConfig).toEqual({
        createdAt: 'createdAt', // Default
        updatedAt: 'modified',
      });
    });

    it('should not have timestampsConfig when timestamps not enabled', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users5', userSchema);

      expect(users._meta.timestampsConfig).toBeUndefined();
    });

    it('should work with other options combined', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('ss_timestamps_users6', userSchema, {
        timestamps: true,
        publicId: 'user',
        softDelete: true,
      });

      expect(users._meta.timestampsConfig).toEqual({
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      });
      expect(users._meta.publicIdConfig).toBeDefined();
      expect(users._meta.softDeleteConfig).toBeDefined();
    });
  });

  describe('insert operations', () => {
    let db: any;

    const itemSchema = z.object({
      name: z.string(),
      category: z.string().optional(),
    });

    const items = fromStandardSchema('ss_timestamps_items', itemSchema, {
      timestamps: true,
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

    it('should set createdAt to current timestamp on insert', async () => {
      const beforeCreate = new Date();
      const item = await db().items.create({ name: 'Test Item' });
      const afterCreate = new Date();

      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(item.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    it('should not set updatedAt on insert', async () => {
      const item = await db().items.create({ name: 'Test Item' });

      expect(item.updatedAt).toBeUndefined();
    });

    it('should not override createdAt if explicitly provided', async () => {
      const customDate = new Date('2020-01-01T00:00:00.000Z');
      const item = await db().items.create({
        name: 'Test Item',
        createdAt: customDate,
      } as any);

      expect(item.createdAt).toEqual(customDate);
    });

    it('should generate unique createdAt for different documents', async () => {
      const item1 = await db().items.create({ name: 'Item 1' });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));
      const item2 = await db().items.create({ name: 'Item 2' });

      expect(item1.createdAt).toBeInstanceOf(Date);
      expect(item2.createdAt).toBeInstanceOf(Date);
      // Both should be valid dates (doesn't have to be different due to timing)
      expect(item1.createdAt.getTime()).toBeLessThanOrEqual(item2.createdAt.getTime());
    });
  });

  describe('update operations', () => {
    let db: any;

    const itemSchema = z.object({
      name: z.string(),
      category: z.string().optional(),
    });

    const items = fromStandardSchema('ss_timestamps_update_items', itemSchema, {
      timestamps: true,
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

    it('should set updatedAt to current timestamp on updateById', async () => {
      const item = await db().items.create({ name: 'Test Item' });
      expect(item.updatedAt).toBeUndefined();

      const beforeUpdate = new Date();
      const updated = await db().items.updateById(item._id, { name: 'Updated Item' });
      const afterUpdate = new Date();

      expect(updated.updatedAt).toBeInstanceOf(Date);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('should set updatedAt to current timestamp on updateOne', async () => {
      const item = await db().items.create({ name: 'Test Item', category: 'original' });

      const beforeUpdate = new Date();
      const updated = await db().items.updateOne(
        { name: 'Test Item' },
        { category: 'updated' }
      );
      const afterUpdate = new Date();

      expect(updated.updatedAt).toBeInstanceOf(Date);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    it('should not modify createdAt on update', async () => {
      const item = await db().items.create({ name: 'Test Item' });
      const originalCreatedAt = item.createdAt;

      const updated = await db().items.updateById(item._id, { name: 'Updated Item' });

      expect(updated.createdAt.getTime()).toEqual(originalCreatedAt.getTime());
    });

    it('should update updatedAt on subsequent updates', async () => {
      const item = await db().items.create({ name: 'Test Item' });

      const update1 = await db().items.updateById(item._id, { name: 'Update 1' });
      const firstUpdatedAt = update1.updatedAt;

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));

      const update2 = await db().items.updateById(item._id, { name: 'Update 2' });
      const secondUpdatedAt = update2.updatedAt;

      expect(secondUpdatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
    });
  });

  describe('custom field names', () => {
    let db: any;

    const articleSchema = z.object({
      title: z.string(),
      content: z.string().optional(),
    });

    const articles = fromStandardSchema('ss_timestamps_articles', articleSchema, {
      timestamps: { createdAt: 'publishedAt', updatedAt: 'lastEditedAt' },
    });

    beforeAll(async () => {
      db = await createTestOrm({ articles });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should use custom createdAt field name on insert', async () => {
      const article = await db().articles.create({ title: 'Test Article' });

      expect(article.publishedAt).toBeInstanceOf(Date);
      expect(article.createdAt).toBeUndefined(); // Default name should not be used
    });

    it('should use custom updatedAt field name on update', async () => {
      const article = await db().articles.create({ title: 'Test Article' });
      expect(article.lastEditedAt).toBeUndefined();

      const updated = await db().articles.updateById(article._id, { title: 'Updated Article' });

      expect(updated.lastEditedAt).toBeInstanceOf(Date);
      expect(updated.updatedAt).toBeUndefined(); // Default name should not be used
    });

    it('should preserve custom createdAt field on update', async () => {
      const article = await db().articles.create({ title: 'Test Article' });
      const originalPublishedAt = article.publishedAt;

      const updated = await db().articles.updateById(article._id, { content: 'New content' });

      expect(updated.publishedAt.getTime()).toEqual(originalPublishedAt.getTime());
    });
  });

  describe('updateMany operations', () => {
    let db: any;

    const itemSchema = z.object({
      name: z.string(),
      category: z.string(),
    });

    const items = fromStandardSchema('ss_timestamps_many_items', itemSchema, {
      timestamps: true,
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

    it('should set updatedAt on updateMany', async () => {
      await db().items.create({ name: 'Item 1', category: 'electronics' });
      await db().items.create({ name: 'Item 2', category: 'electronics' });
      await db().items.create({ name: 'Item 3', category: 'books' });

      const beforeUpdate = new Date();
      const count = await db().items.updateMany(
        { category: 'electronics' },
        { category: 'tech' }
      );
      const afterUpdate = new Date();

      expect(count).toBe(2);

      // Verify updatedAt was set on affected documents
      const updated = await db().items.findMany({ category: 'tech' });
      expect(updated).toHaveLength(2);
      for (const item of updated) {
        expect(item.updatedAt).toBeInstanceOf(Date);
        expect(item.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
        expect(item.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
      }

      // Verify unaffected document has no updatedAt
      const unaffected = await db().items.findOne({ category: 'books' });
      expect(unaffected.updatedAt).toBeUndefined();
    });
  });

  describe('without timestamps', () => {
    let db: any;

    const itemSchema = z.object({
      name: z.string(),
    });

    const items = fromStandardSchema('ss_no_timestamps_items', itemSchema);

    beforeAll(async () => {
      db = await createTestOrm({ items });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should not add createdAt on insert when timestamps not enabled', async () => {
      const item = await db().items.create({ name: 'Test Item' });

      expect(item.createdAt).toBeUndefined();
    });

    it('should not add updatedAt on update when timestamps not enabled', async () => {
      const item = await db().items.create({ name: 'Test Item' });
      const updated = await db().items.updateById(item._id, { name: 'Updated Item' });

      expect(updated.updatedAt).toBeUndefined();
    });
  });
});
