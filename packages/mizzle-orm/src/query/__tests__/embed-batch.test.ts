/**
 * Batch optimization tests for embed operations
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, array, objectId } from '../../schema/fields';
import { embed } from '../../collection/relations';

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('Batch Embed Optimization', () => {
  it('should efficiently handle multiple embeds for single document', async () => {
    const authors = mongoCollection('authors', {
      _id: objectId().internalId(),
      name: string(),
      email: string(),
    });

    const posts = mongoCollection(
      'posts',
      {
        _id: objectId().internalId(),
        title: string(),
        authorId: objectId(),
      },
      {
        relations: {
          author: embed(authors, {
            forward: {
              from: 'authorId',
              fields: ['name', 'email'],
            },
          }),
        },
      },
    );

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    // Create author
    const author = await db.authors.create({
      name: 'Alice',
      email: 'alice@example.com',
    });

    // Create multiple posts - embeddings are optimized per document
    const post1 = await db.posts.create({
      title: 'Post 1',
      authorId: author._id,
    });

    const post2 = await db.posts.create({
      title: 'Post 2',
      authorId: author._id,
    });

    // All posts should have embedded author data
    expect(post1.author?.name).toBe('Alice');
    expect(post2.author?.name).toBe('Alice');

    await orm.close();
  });

  it('should optimize array embed lookups by batching IDs', async () => {
    const tags = mongoCollection('tags', {
      _id: objectId().internalId(),
      name: string(),
      color: string(),
    });

    const posts = mongoCollection(
      'posts',
      {
        _id: objectId().internalId(),
        title: string(),
        tagIds: array(objectId()),
      },
      {
        relations: {
          tags: embed(tags, {
            forward: {
              from: 'tagIds',
              fields: ['name', 'color'],
            },
          }),
        },
      },
    );

    const orm = await createTestOrm({ tags, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    // Create tags
    const tag1 = await db.tags.create({ name: 'Tech', color: 'blue' });
    const tag2 = await db.tags.create({ name: 'News', color: 'red' });
    const tag3 = await db.tags.create({ name: 'Sports', color: 'green' });

    // Create post with multiple tags
    // Should batch all tag lookups into a single query
    const post = await db.posts.create({
      title: 'Multi-tag Post',
      tagIds: [tag1._id, tag2._id, tag3._id],
    });

    // All tags should be embedded
    expect(post.tags).toHaveLength(3);
    expect(post.tags?.[0].name).toBe('Tech');
    expect(post.tags?.[1].name).toBe('News');
    expect(post.tags?.[2].name).toBe('Sports');

    await orm.close();
  });

  it('should batch reverse embed propagations with updateMany', async () => {
    const authors = mongoCollection('authors', {
      _id: objectId().internalId(),
      name: string(),
      email: string(),
    });

    const posts = mongoCollection(
      'posts',
      {
        _id: objectId().internalId(),
        title: string(),
        authorId: objectId(),
      },
      {
        relations: {
          author: embed(authors, {
            forward: {
              from: 'authorId',
              fields: ['name', 'email'],
            },
            keepFresh: true,
          }),
        },
      },
    );

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const author = await db.authors.create({
      name: 'Alice',
      email: 'alice@example.com',
    });

    // Create multiple posts by the same author
    await db.posts.create({ title: 'Post 1', authorId: author._id });
    await db.posts.create({ title: 'Post 2', authorId: author._id });
    await db.posts.create({ title: 'Post 3', authorId: author._id });

    // Update author - updateMany is used internally to batch reverse embed updates
    await db.authors.updateById(author._id, {
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
    });

    // All posts should have updated author data
    const allPosts = await db.posts.findMany({});
    expect(allPosts).toHaveLength(3);
    for (const post of allPosts) {
      expect(post.author?.name).toBe('Alice Smith');
      expect(post.author?.email).toBe('alice.smith@example.com');
    }

    await orm.close();
  });
});
