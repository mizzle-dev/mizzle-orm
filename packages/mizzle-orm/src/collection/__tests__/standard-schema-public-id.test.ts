/**
 * Tests for Standard Schema publicId support
 * Story US-005: Add publicId support for Standard Schema collections
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { MongoClient, Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fromStandardSchema, type SSCollectionDefinition } from '../from-standard-schema';
import { CollectionFacade } from '../../query/collection-facade';
import type { OrmContext } from '../../types/orm';

describe('Standard Schema publicId support', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let ctx: OrmContext;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = await MongoClient.connect(uri);
    db = client.db('test');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    // Clean up collections
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      await db.dropCollection(col.name);
    }
    ctx = { session: undefined };
  });

  describe('fromStandardSchema publicId option', () => {
    it('should accept publicId option with prefix string', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
      });

      expect(users._meta.options.publicId).toBe('user');
      expect(users._meta.publicIdConfig).toEqual({
        prefix: 'user',
        field: 'id',
      });
    });

    it('should accept publicId option with { prefix } object', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: { prefix: 'usr' },
      });

      expect(users._meta.publicIdConfig).toEqual({
        prefix: 'usr',
        field: 'id', // Default field
      });
    });

    it('should accept publicId option with { prefix, field } object', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: { prefix: 'usr', field: 'publicId' },
      });

      expect(users._meta.publicIdConfig).toEqual({
        prefix: 'usr',
        field: 'publicId',
      });
    });

    it('should default field to "id" if not specified', () => {
      const schema = z.object({ name: z.string() });

      const items1 = fromStandardSchema('items', schema, { publicId: 'item' });
      const items2 = fromStandardSchema('items', schema, { publicId: { prefix: 'item' } });

      expect(items1._meta.publicIdConfig?.field).toBe('id');
      expect(items2._meta.publicIdConfig?.field).toBe('id');
    });

    it('should have undefined publicIdConfig when no publicId option', () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema);

      expect(items._meta.publicIdConfig).toBeUndefined();
    });
  });

  describe('insert with publicId auto-generation', () => {
    it('should auto-generate a prefixed public ID on insert', async () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
      });

      const facade = new CollectionFacade(db, users as any, ctx);
      const doc = await facade.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(doc.id).toBeDefined();
      expect(typeof doc.id).toBe('string');
      expect(doc.id.startsWith('user_')).toBe(true);
      expect(doc.id.length).toBeGreaterThan(10); // user_ + random chars
    });

    it('should use custom field name for public ID', async () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: { prefix: 'usr', field: 'publicId' },
      });

      const facade = new CollectionFacade(db, users as any, ctx);
      const doc = await facade.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(doc.publicId).toBeDefined();
      expect(doc.publicId.startsWith('usr_')).toBe(true);
      expect(doc.id).toBeUndefined(); // Default field not used
    });

    it('should not overwrite provided public ID', async () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
      });

      const facade = new CollectionFacade(db, users as any, ctx);
      const doc = await facade.create({
        email: 'test@example.com',
        name: 'Test User',
        id: 'user_custom123',
      } as any);

      expect(doc.id).toBe('user_custom123');
    });

    it('should generate unique IDs for multiple inserts', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, { publicId: 'item' });
      const facade = new CollectionFacade(db, items as any, ctx);

      const doc1 = await facade.create({ name: 'Item 1' });
      const doc2 = await facade.create({ name: 'Item 2' });
      const doc3 = await facade.create({ name: 'Item 3' });

      expect(doc1.id).not.toBe(doc2.id);
      expect(doc2.id).not.toBe(doc3.id);
      expect(doc1.id).not.toBe(doc3.id);

      // All should have the same prefix
      expect(doc1.id.startsWith('item_')).toBe(true);
      expect(doc2.id.startsWith('item_')).toBe(true);
      expect(doc3.id.startsWith('item_')).toBe(true);
    });
  });

  describe('findById with public ID', () => {
    it('should find document by public ID', async () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
      });

      const facade = new CollectionFacade(db, users as any, ctx);
      const created = await facade.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      const found = await facade.findById(created.id);

      expect(found).not.toBeNull();
      expect(found._id).toEqual(created._id);
      expect(found.email).toBe('test@example.com');
      expect(found.name).toBe('Test User');
    });

    it('should find by public ID with custom field name', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: { prefix: 'itm', field: 'publicId' },
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'Test Item' });

      const found = await facade.findById(created.publicId);

      expect(found).not.toBeNull();
      expect(found._id).toEqual(created._id);
      expect(found.name).toBe('Test Item');
    });

    it('should still support findById with ObjectId', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'Test Item' });

      // Find by ObjectId
      const found = await facade.findById(created._id);

      expect(found).not.toBeNull();
      expect(found.name).toBe('Test Item');
    });

    it('should return null for non-existent public ID', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      await facade.create({ name: 'Test Item' });

      const found = await facade.findById('item_nonexistent123');

      expect(found).toBeNull();
    });
  });

  describe('updateById and deleteById with public ID', () => {
    it('should update document by public ID', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'Original' });

      const updated = await facade.updateById(created.id, { name: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.id).toBe(created.id);
    });

    it('should delete document by public ID', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'To Delete' });

      const deleted = await facade.deleteById(created.id);
      expect(deleted).toBe(true);

      const found = await facade.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('integration with other SS collection features', () => {
    it('should work with Standard Schema validation', async () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string().min(2),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
      });

      const facade = new CollectionFacade(db, users as any, ctx);

      // Valid insert should work and have publicId
      const doc = await facade.create({
        email: 'test@example.com',
        name: 'Valid Name',
      });
      expect(doc.id.startsWith('user_')).toBe(true);

      // Invalid insert should still fail validation
      await expect(
        facade.create({
          email: 'invalid-email',
          name: 'Valid Name',
        })
      ).rejects.toThrow();
    });

    it('should work with combined options (softDelete, timestamps)', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
        softDelete: true,
        timestamps: true,
      });

      expect(items._meta.publicIdConfig).toEqual({
        prefix: 'item',
        field: 'id',
      });
      expect(items._meta.options.softDelete).toBe(true);
      expect(items._meta.options.timestamps).toBe(true);
    });

    it('should store public ID in the database correctly', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'Test' });

      // Verify in raw collection
      const raw = await db.collection('items').findOne({ _id: created._id });
      expect(raw).not.toBeNull();
      expect(raw!.id).toBe(created.id);
      expect(raw!.id.startsWith('item_')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should treat empty string prefix as no publicId', () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: '',
      });

      // Empty string is falsy, so no publicIdConfig is created
      expect(items._meta.publicIdConfig).toBeUndefined();
    });

    it('should handle special characters in prefix', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'my-item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const doc = await facade.create({ name: 'Test' });

      expect(doc.id.startsWith('my-item_')).toBe(true);
    });

    it('should find by public ID that contains underscore in prefix', async () => {
      const schema = z.object({ name: z.string() });
      const items = fromStandardSchema('items', schema, {
        publicId: 'org_item',
      });

      const facade = new CollectionFacade(db, items as any, ctx);
      const created = await facade.create({ name: 'Test' });

      expect(created.id.startsWith('org_item_')).toBe(true);

      const found = await facade.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Test');
    });
  });
});
