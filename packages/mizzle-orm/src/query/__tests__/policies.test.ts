/**
 * Policy enforcement tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, objectId } from '../../schema/fields';
import type { Mizzle } from '../../types/orm';
import { ObjectId } from 'mongodb';

describe('Policies', () => {
  let db: Mizzle;

  // Test collection with policies
  const documents = mongoCollection(
    'documents',
    {
      title: string(),
      ownerId: objectId(),
    },
    {
      policies: {
        // Read filter - only return documents owned by current user
        readFilter: (ctx) => {
          if (!ctx.user?.id) return {};
          return { ownerId: new ObjectId(ctx.user.id) };
        },
        // Can insert - must set ownerId to current user
        canInsert: async (ctx, doc) => {
          return doc.ownerId?.toString() === ctx.user?.id;
        },
        // Can update - must own the document
        canUpdate: async (ctx, oldDoc) => {
          return oldDoc.ownerId.toString() === ctx.user?.id;
        },
        // Can delete - must own the document
        canDelete: async (ctx, doc) => {
          return doc.ownerId.toString() === ctx.user?.id;
        },
      },
    }
  );

  const user1_Id = new ObjectId();
  const user2_Id = new ObjectId();

  beforeAll(async () => {
    db = await createTestOrm({ documents });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('readFilter', () => {
    it('should filter results by ownership', async () => {
      const db1 = db({ user: { id: user1_Id.toString() } });
      const db2 = db({ user: { id: user2_Id.toString() } });

      // Create docs for both users through raw collection (bypass policies)
      const raw = db1.documents.rawCollection();
      await raw.insertOne({ title: 'User 1 Doc', ownerId: user1_Id } as any);
      await raw.insertOne({ title: 'User 2 Doc', ownerId: user2_Id } as any);

      // Each user should only see their own docs
      const user1Docs = await db1.documents.findMany({});
      const user2Docs = await db2.documents.findMany({});

      expect(user1Docs).toHaveLength(1);
      expect(user2Docs).toHaveLength(1);
      expect(user1Docs[0].title).toBe('User 1 Doc');
      expect(user2Docs[0].title).toBe('User 2 Doc');
    });
  });

  describe('canInsert', () => {
    it('should allow insert when policy passes', async () => {
      const doc = await db({ user: { id: user1_Id.toString() } }).documents.create({
        title: 'My Document',
        ownerId: user1_Id,
      });

      expect(doc.title).toBe('My Document');
    });

    it('should reject insert when policy fails', async () => {
      await expect(
        db({ user: { id: user1_Id.toString() } }).documents.create({
          title: 'Someone Elses Doc',
          ownerId: user2_Id,
        })
      ).rejects.toThrow('Insert not allowed by policy');
    });
  });

  describe('canUpdate', () => {
    it('should allow update when policy passes', async () => {
      const doc = await db({ user: { id: user1_Id.toString() } }).documents.create({
        title: 'Original',
        ownerId: user1_Id,
      });

      const updated = await db({ user: { id: user1_Id.toString() } }).documents.updateById(doc._id, { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
    });

    it('should reject update when policy fails', async () => {
      const db1 = db({ user: { id: user1_Id.toString() } });
      const db2 = db({ user: { id: user2_Id.toString() } });

      // User 1 creates a document
      const doc = await db1.documents.create({
        title: 'User 1 Doc',
        ownerId: user1_Id,
      });

      // User 2 tries to update it - should fail (won't find it due to readFilter)
      const updated = await db2.documents.updateById(doc._id, { title: 'Hacked' });
      expect(updated).toBeNull();
    });
  });

  describe('canDelete', () => {
    it('should allow delete when policy passes', async () => {
      const doc = await db({ user: { id: user1_Id.toString() } }).documents.create({
        title: 'To Delete',
        ownerId: user1_Id,
      });

      const deleted = await db({ user: { id: user1_Id.toString() } }).documents.deleteById(doc._id);
      expect(deleted).toBe(true);
    });

    it('should reject delete when policy fails', async () => {
      const db1 = db({ user: { id: user1_Id.toString() } });
      const db2 = db({ user: { id: user2_Id.toString() } });

      // User 1 creates a document
      const doc = await db1.documents.create({
        title: 'User 1 Doc',
        ownerId: user1_Id,
      });

      // User 2 tries to delete it - should return false (won't find it due to readFilter)
      const deleted = await db2.documents.deleteById(doc._id);
      expect(deleted).toBe(false);
    });
  });
});
