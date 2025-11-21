/**
 * Async propagation strategy tests
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, objectId } from '../../schema/fields';
import { embed } from '../../collection/relations';

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('Async Propagation Strategy', () => {
  it('should defer embed updates when using async strategy', async () => {
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
            reverse: {
              enabled: true,
              strategy: 'async', // ← Async propagation
            },
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

    const post = await db.posts.create({
      title: 'My Post',
      authorId: author._id,
    });

    expect(post.author?.name).toBe('Alice');

    // Update author
    await db.authors.updateById(author._id, {
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
    });

    // Immediately after update, embedded data should NOT be updated yet (async)
    const postImmediately = await db.posts.findById(post._id);
    expect(postImmediately?.author?.name).toBe('Alice'); // Still old data

    // Wait for async propagation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now the embedded data should be updated
    const postAfterAsync = await db.posts.findById(post._id);
    expect(postAfterAsync?.author?.name).toBe('Alice Smith');
    expect(postAfterAsync?.author?.email).toBe('alice.smith@example.com');

    await orm.close();
  });

  it('should handle sync strategy (default behavior)', async () => {
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
            reverse: {
              enabled: true,
              strategy: 'sync', // ← Sync propagation (default)
            },
          }),
        },
      },
    );

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const author = await db.authors.create({
      name: 'Bob',
      email: 'bob@example.com',
    });

    const post = await db.posts.create({
      title: 'My Post',
      authorId: author._id,
    });

    // Update author
    await db.authors.updateById(author._id, {
      name: 'Bob Smith',
      email: 'bob.smith@example.com',
    });

    // Immediately after update, embedded data should be updated (sync)
    const updatedPost = await db.posts.findById(post._id);
    expect(updatedPost?.author?.name).toBe('Bob Smith');
    expect(updatedPost?.author?.email).toBe('bob.smith@example.com');

    await orm.close();
  });

  it('should use sync strategy by default when keepFresh: true', async () => {
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
            keepFresh: true, // ← Shorthand for sync strategy
          }),
        },
      },
    );

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const author = await db.authors.create({
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    const post = await db.posts.create({
      title: 'My Post',
      authorId: author._id,
    });

    // Update author
    await db.authors.updateById(author._id, {
      name: 'Charlie Brown',
    });

    // Should be updated immediately (sync is default)
    const updatedPost = await db.posts.findById(post._id);
    expect(updatedPost?.author?.name).toBe('Charlie Brown');

    await orm.close();
  });
});
