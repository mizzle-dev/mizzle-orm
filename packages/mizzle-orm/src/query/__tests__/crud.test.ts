/**
 * CRUD operations integration tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, date, number, publicId } from '../../schema/fields';
import type { Mizzle } from '../../types/orm';

describe('CRUD Operations', () => {
  let db: Mizzle;

  // Test collection schema
  const users = mongoCollection('users', {
    id: publicId('user'),
    name: string(),
    email: string().email(),
    age: number().int().positive().optional(),
    createdAt: date().defaultNow(),
    updatedAt: date().onUpdateNow(),
  });

  beforeAll(async () => {
    db = await createTestOrm({ users });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('create()', () => {
    it('should create a document', async () => {

      const user = await db().users.create({
        name: 'Alice',
        email: 'alice@example.com',
      });

      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@example.com');
      expect(user._id).toBeInstanceOf(ObjectId);
    });

    it('should auto-generate public ID', async () => {

      const user = await db().users.create({
        name: 'Bob',
        email: 'bob@example.com',
      });

      expect(user.id).toMatch(/^user_/);
      expect(user.id.length).toBe(27); // 'user_' (5) + 22 chars
    });

    it('should apply defaultNow timestamp', async () => {

      const before = new Date();
      const user = await db().users.create({
        name: 'Charlie',
        email: 'charlie@example.com',
      });
      const after = new Date();

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('findById()', () => {
    it('should find by ObjectId', async () => {

      const created = await db().users.create({
        name: 'Dave',
        email: 'dave@example.com',
      });

      const found = await db().users.findById(created._id);
      expect(found?.name).toBe('Dave');
    });

    it('should find by public ID', async () => {

      const created = await db().users.create({
        name: 'Eve',
        email: 'eve@example.com',
      });

      const found = await db().users.findById(created.id);
      expect(found?.name).toBe('Eve');
      expect(found?._id.toString()).toBe(created._id.toString());
    });

    it('should return null for non-existent ID', async () => {

      const found = await db().users.findById(new ObjectId());
      expect(found).toBeNull();
    });
  });

  describe('findOne()', () => {
    it('should find one document', async () => {

      await db().users.create({
        name: 'Frank',
        email: 'frank@example.com',
      });

      const found = await db().users.findOne({ email: 'frank@example.com' });
      expect(found?.name).toBe('Frank');
    });

    it('should return null if not found', async () => {

      const found = await db().users.findOne({ email: 'nonexistent@example.com' });
      expect(found).toBeNull();
    });
  });

  describe('findMany()', () => {
    it('should find multiple documents', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com' });
      await db().users.create({ name: 'User2', email: 'user2@example.com' });
      await db().users.create({ name: 'User3', email: 'user3@example.com' });

      const found = await db().users.findMany({});
      expect(found).toHaveLength(3);
    });

    it('should support limit', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com' });
      await db().users.create({ name: 'User2', email: 'user2@example.com' });
      await db().users.create({ name: 'User3', email: 'user3@example.com' });

      const found = await db().users.findMany({}, { limit: 2 });
      expect(found).toHaveLength(2);
    });

    it('should support sort', async () => {

      await db().users.create({ name: 'Charlie', email: 'c@example.com' });
      await db().users.create({ name: 'Alice', email: 'a@example.com' });
      await db().users.create({ name: 'Bob', email: 'b@example.com' });

      const found = await db().users.findMany({}, { sort: { name: 1 } });
      expect(found[0].name).toBe('Alice');
      expect(found[1].name).toBe('Bob');
      expect(found[2].name).toBe('Charlie');
    });

    it('should support skip', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com' });
      await db().users.create({ name: 'User2', email: 'user2@example.com' });
      await db().users.create({ name: 'User3', email: 'user3@example.com' });

      const found = await db().users.findMany({}, { skip: 1 });
      expect(found).toHaveLength(2);
    });
  });

  describe('count()', () => {
    it('should count documents', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com' });
      await db().users.create({ name: 'User2', email: 'user2@example.com' });

      const count = await db().users.count({});
      expect(count).toBe(2);
    });

    it('should count with filter', async () => {

      await db().users.create({ name: 'Alice', email: 'alice@example.com', age: 25 });
      await db().users.create({ name: 'Bob', email: 'bob@example.com', age: 30 });
      await db().users.create({ name: 'Charlie', email: 'charlie@example.com', age: 35 });

      const count = await db().users.count({ age: { $gte: 30 } });
      expect(count).toBe(2);
    });
  });

  describe('updateById()', () => {
    it('should update by ID', async () => {

      const user = await db().users.create({
        name: 'Original',
        email: 'original@example.com',
      });

      const updated = await db().users.updateById(user._id, { name: 'Updated' });
      expect(updated?.name).toBe('Updated');
      expect(updated?.email).toBe('original@example.com');
    });

    it('should apply onUpdateNow timestamp', async () => {

      const user = await db().users.create({
        name: 'Test',
        email: 'test@example.com',
      });

      const before = new Date();
      const updated = await db().users.updateById(user._id, { name: 'Updated' });
      const after = new Date();

      expect(updated?.updatedAt).toBeInstanceOf(Date);
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updated!.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should return null for non-existent ID', async () => {

      const updated = await db().users.updateById(new ObjectId(), { name: 'Test' });
      expect(updated).toBeNull();
    });
  });

  describe('updateOne()', () => {
    it('should update one document', async () => {

      await db().users.create({ name: 'Test', email: 'test@example.com' });

      const updated = await db().users.updateOne(
        { email: 'test@example.com' },
        { name: 'Updated' }
      );

      expect(updated?.name).toBe('Updated');
    });
  });

  describe('updateMany()', () => {
    it('should update multiple documents', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com', age: 20 });
      await db().users.create({ name: 'User2', email: 'user2@example.com', age: 25 });
      await db().users.create({ name: 'User3', email: 'user3@example.com', age: 30 });

      const count = await db().users.updateMany({ age: { $gte: 25 } }, { age: 99 });
      expect(count).toBe(2);

      const updated = await db().users.findMany({ age: 99 });
      expect(updated).toHaveLength(2);
    });
  });

  describe('deleteById()', () => {
    it('should delete by ID', async () => {

      const user = await db().users.create({
        name: 'ToDelete',
        email: 'delete@example.com',
      });

      const deleted = await db().users.deleteById(user._id);
      expect(deleted).toBe(true);

      const found = await db().users.findById(user._id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', async () => {

      const deleted = await db().users.deleteById(new ObjectId());
      expect(deleted).toBe(false);
    });
  });

  describe('deleteOne()', () => {
    it('should delete one document', async () => {

      await db().users.create({ name: 'Test', email: 'test@example.com' });

      const deleted = await db().users.deleteOne({ email: 'test@example.com' });
      expect(deleted).toBe(true);

      const found = await db().users.findOne({ email: 'test@example.com' });
      expect(found).toBeNull();
    });
  });

  describe('deleteMany()', () => {
    it('should delete multiple documents', async () => {

      await db().users.create({ name: 'User1', email: 'user1@example.com', age: 20 });
      await db().users.create({ name: 'User2', email: 'user2@example.com', age: 25 });
      await db().users.create({ name: 'User3', email: 'user3@example.com', age: 30 });

      const count = await db().users.deleteMany({ age: { $gte: 25 } });
      expect(count).toBe(2);

      const remaining = await db().users.findMany({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].age).toBe(20);
    });
  });
});
