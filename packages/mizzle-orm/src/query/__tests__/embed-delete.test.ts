/**
 * Embed relations - Delete handling tests
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

describe('Embed Delete - Nullify Strategy', () => {
  it('should set embedded field to null when source is deleted', async () => {
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
        authorId: objectId().optional(),
      },
      {
        relations: {
          author: embed(authors, {
            forward: {
              from: 'authorId',
              fields: ['name', 'email'],
            },
            onSourceDelete: 'nullify', // Set embed to null
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

    expect(post.author).toBeDefined();
    if (Array.isArray(post.author)) throw new Error('Expected single embed');
    expect(post.author?.name).toBe('Alice');

    // Delete the author
    await db.authors.deleteById(author._id);

    // Post should still exist, but author field should be null
    const updatedPost = await db.posts.findById(post._id);
    expect(updatedPost).toBeDefined();
    expect(updatedPost?.author).toBeNull();
    expect(updatedPost?.authorId).toBeNull(); // Reference also nullified

  });
});

describe('Embed Delete - Clear Strategy', () => {
  it('should clear embedded data but keep reference when source is deleted', async () => {
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
            onSourceDelete: 'clear', // Clear embed, keep reference
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

    expect(post.author).toBeDefined();

    // Delete the author
    await db.authors.deleteById(author._id);

    // Post should still exist with reference, but no embedded data
    const updatedPost = await db.posts.findById(post._id);
    expect(updatedPost).toBeDefined();
    expect(updatedPost?.authorId).toEqual(author._id); // Reference kept
    expect(updatedPost?.author).toBeNull(); // Embed cleared

  });
});

describe('Embed Delete - Cascade Strategy', () => {
  it('should delete documents that embed the deleted source', async () => {
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
            onSourceDelete: 'cascade', // Delete entire document
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

    const post1 = await db.posts.create({
      title: 'Post 1',
      authorId: author._id,
    });

    const post2 = await db.posts.create({
      title: 'Post 2',
      authorId: author._id,
    });

    // Both posts exist
    expect(await db.posts.count({ title: 'Post 1' })).toBe(1);
    expect(await db.posts.count({ title: 'Post 2' })).toBe(1);

    // Delete the author
    await db.authors.deleteById(author._id);

    // Both posts should be deleted
    expect(await db.posts.findById(post1._id)).toBeNull();
    expect(await db.posts.findById(post2._id)).toBeNull();
    expect(await db.posts.count()).toBe(0);

  });
});

describe('Embed Delete - No Action (default)', () => {
  it('should leave embedded data unchanged when source is deleted (default)', async () => {
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
            // No onSourceDelete - default is 'no-action'
          }),
        },
      },
    );

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const author = await db.authors.create({
      name: 'Dave',
      email: 'dave@example.com',
    });

    const post = await db.posts.create({
      title: 'My Post',
      authorId: author._id,
    });

    const originalAuthor = post.author;
    expect(originalAuthor).toBeDefined();

    // Delete the author
    await db.authors.deleteById(author._id);

    // Post should still exist with embedded data unchanged (stale data)
    const updatedPost = await db.posts.findById(post._id);
    expect(updatedPost).toBeDefined();
    expect(updatedPost?.authorId).toEqual(author._id);
    if (Array.isArray(updatedPost?.author)) throw new Error('Expected single embed');
    expect(updatedPost?.author?.name).toBe('Dave'); // Still has old data
    expect(updatedPost?.author?.email).toBe('dave@example.com');

  });
});
