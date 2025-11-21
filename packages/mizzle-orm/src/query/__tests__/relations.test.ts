/**
 * Relations tests (REFERENCE, LOOKUP, EMBED)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, objectId } from '../../schema/fields';
import { lookup, reference } from '../../collection/relations';

describe('Relations', () => {
  // Authors collection
  const authors = mongoCollection('authors', {
    name: string(),
    email: string(),
  });

  // Posts collection with REFERENCE and LOOKUP relations
  const posts = mongoCollection(
    'posts',
    {
      title: string(),
      authorId: objectId(),
    },
    {
      relations: {
        author: lookup(authors, {
          localField: 'authorId',
          foreignField: '_id',
          one: true,
        }),
        authorRef: reference(authors, {
          localField: 'authorId',
          foreignField: '_id',
        }),
      },
    }
  );

  let orm: Awaited<ReturnType<typeof setupOrm>>;

  async function setupOrm() {
    return createTestOrm({
      authors,
      posts,
    });
  }

  beforeAll(async () => {
    orm = await setupOrm();
  });

  afterAll(async () => {
    await orm.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('REFERENCE relations', () => {
    it('should validate references on insert', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create an author
      const author = await db.authors.create({
        name: 'John Doe',
        email: 'john@example.com',
      });

      // Creating post with valid authorId should succeed
      const post = await db.posts.create({
        title: 'My Post',
        authorId: author._id,
      });

      expect(post.title).toBe('My Post');
      expect(post.authorId.toString()).toBe(author._id.toString());
    });

    it('should reject invalid references on insert', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Creating post with non-existent authorId should fail
      await expect(
        db.posts.create({
          title: 'Invalid Post',
          authorId: new ObjectId(),
        })
      ).rejects.toThrow('Invalid reference');
    });

    it('should validate references on update', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author1 = await db.authors.create({
        name: 'Author 1',
        email: 'author1@example.com',
      });

      const author2 = await db.authors.create({
        name: 'Author 2',
        email: 'author2@example.com',
      });

      const post = await db.posts.create({
        title: 'Post',
        authorId: author1._id,
      });

      // Updating to valid authorId should succeed
      const updated = await db.posts.updateById(post._id, {
        authorId: author2._id,
      });

      expect(updated?.authorId.toString()).toBe(author2._id.toString());
    });

    it('should reject invalid references on update', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author = await db.authors.create({
        name: 'Author',
        email: 'author@example.com',
      });

      const post = await db.posts.create({
        title: 'Post',
        authorId: author._id,
      });

      // Updating to invalid authorId should fail
      await expect(
        db.posts.updateById(post._id, {
          authorId: new ObjectId(),
        })
      ).rejects.toThrow('Invalid reference');
    });
  });

  describe('LOOKUP relations with include', () => {
    it('should include single relation', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author = await db.authors.create({
        name: 'Jane Doe',
        email: 'jane@example.com',
      });

      const post = await db.posts.create({
        title: 'Great Article',
        authorId: author._id,
      });

      // Fetch post with include
      const posts = await db.posts.findMany({ _id: post._id }, { include: 'author' });

      expect(posts).toHaveLength(1);
      expect(posts[0].author).toBeDefined();
      expect(posts[0].author?.name).toBe('Jane Doe');
      expect(posts[0].author?._id.toString()).toBe(author._id.toString());
    });

    it('should include relation for multiple documents', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author1 = await db.authors.create({
        name: 'Author 1',
        email: 'author1@example.com',
      });

      const author2 = await db.authors.create({
        name: 'Author 2',
        email: 'author2@example.com',
      });

      await db.posts.create({ title: 'Post 1', authorId: author1._id });
      await db.posts.create({ title: 'Post 2', authorId: author2._id });
      await db.posts.create({ title: 'Post 3', authorId: author1._id });

      const posts = await db.posts.findMany({}, { include: 'author' });

      expect(posts).toHaveLength(3);
      expect(posts[0].author?.name).toBe('Author 1');
      expect(posts[1].author?.name).toBe('Author 2');
      expect(posts[2].author?.name).toBe('Author 1');
    });

    it('should handle missing relations gracefully', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author = await db.authors.create({
        name: 'Author',
        email: 'author@example.com',
      });

      const post = await db.posts.create({
        title: 'Post',
        authorId: author._id,
      });

      // Delete the author
      await db.authors.deleteById(author._id);

      // Include should not crash and return null for missing relation
      const posts = await db.posts.findMany({ _id: post._id }, { include: 'author' });

      expect(posts).toHaveLength(1);
      // When relation is missing, MongoDB $lookup returns undefined
      expect(posts[0].author).toBeUndefined();
    });
  });

  describe('include error handling', () => {
    it('should throw error for non-existent relation', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      await expect(
        db.posts.findMany({}, { include: 'nonExistentRelation' as any })
      ).rejects.toThrow("Relation 'nonExistentRelation' not found");
    });
  });

  describe('Multiple includes', () => {
    it('should include multiple relations using object syntax', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const author = await db.authors.create({
        name: 'Test Author',
        email: 'test@example.com',
      });

      const post = await db.posts.create({
        title: 'Test Post',
        authorId: author._id,
      });

      // Include both author and authorRef
      const posts = await db.posts.findMany(
        { _id: post._id },
        {
          include: {
            author: true,
            authorRef: true,
          },
        }
      );

      expect(posts).toHaveLength(1);
      expect(posts[0].author).toBeDefined();
      expect(posts[0].author?.name).toBe('Test Author');
      expect(posts[0].authorRef).toBeDefined();
      expect(posts[0].authorRef?._id.toString()).toBe(author._id.toString());
    });
  });
});
