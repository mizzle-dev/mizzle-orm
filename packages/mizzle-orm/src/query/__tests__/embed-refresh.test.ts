/**
 * Embed refresh API tests
 * Tests query-time refresh and manual batch refresh functionality
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

describe('Query-Time Refresh (Read-Only)', () => {
  it('should refresh embeds during query without persisting', async () => {
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

    const db = await createTestOrm({ authors, posts });

    // Create author and post
    const author = await db().authors.create({
      name: 'Alice',
      email: 'alice@example.com',
    });

    const post = await db().posts.create({
      title: 'My Post',
      authorId: author._id,
    });

    // Verify initial embed
    expect(post.author).toBeDefined();

    // Update author name directly in DB (bypass ORM to avoid auto-update)
    await db().authors.rawCollection().updateOne(
      { _id: author._id },
      { $set: { name: 'Alice Updated', email: 'alice.new@example.com' } },
    );

    // Query with refresh - should get fresh data
    const refreshedPosts = await db().posts.findMany({}, { refreshEmbeds: ['author'] });

    expect(refreshedPosts).toHaveLength(1);
    if (Array.isArray(refreshedPosts[0].author)) throw new Error('Expected single embed');
    expect(refreshedPosts[0].author?.name).toBe('Alice Updated');
    expect(refreshedPosts[0].author?.email).toBe('alice.new@example.com');

    // Verify the update was NOT persisted in the database
    const postFromDb = await db().posts.findById(post._id);
    if (Array.isArray(postFromDb?.author)) throw new Error('Expected single embed');
    expect(postFromDb?.author?.name).toBe('Alice'); // Still old value
  });

  it('should handle multiple embed refreshes', async () => {
    const users = mongoCollection('users', {
      _id: objectId().internalId(),
      name: string(),
    });

    const categories = mongoCollection('categories', {
      _id: objectId().internalId(),
      title: string(),
    });

    const articles = mongoCollection(
      'articles',
      {
        _id: objectId().internalId(),
        title: string(),
        authorId: objectId(),
        categoryId: objectId(),
      },
      {
        relations: {
          author: embed(users, {
            forward: {
              from: 'authorId',
              fields: ['name'],
            },
          }),
          category: embed(categories, {
            forward: {
              from: 'categoryId',
              fields: ['title'],
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ users, categories, articles });

    const user = await db().users.create({ name: 'Bob' });
    const category = await db().categories.create({ title: 'Tech' });

    await db().articles.create({
      title: 'Article 1',
      authorId: user._id,
      categoryId: category._id,
    });

    // Update both sources
    await db().users.rawCollection().updateOne(
      { _id: user._id },
      { $set: { name: 'Bob Updated' } },
    );
    await db().categories.rawCollection().updateOne(
      { _id: category._id },
      { $set: { title: 'Tech Updated' } },
    );

    // Refresh both embeds
    const refreshed = await db().articles.findMany({}, { refreshEmbeds: ['author', 'category'] });

    if (Array.isArray(refreshed[0].author)) throw new Error('Expected single embed');
    if (Array.isArray(refreshed[0].category)) throw new Error('Expected single embed');
    expect(refreshed[0].author?.name).toBe('Bob Updated');
    expect(refreshed[0].category?.title).toBe('Tech Updated');
  });
});

describe('Manual Batch Refresh (Persist Updates)', () => {
  it('should refresh and persist embed updates', async () => {
    const authors = mongoCollection('authors', {
      _id: objectId().internalId(),
      name: string(),
      bio: string(),
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
              fields: ['name', 'bio'],
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ authors, posts });

    const author = await db().authors.create({
      name: 'Charlie',
      bio: 'Writer',
    });

    await db().posts.create({
      title: 'Post 1',
      authorId: author._id,
    });

    // Update author directly
    await db().authors.rawCollection().updateOne(
      { _id: author._id },
      { $set: { name: 'Charlie Updated', bio: 'Senior Writer' } },
    );

    // Manual refresh - should persist updates
    const stats = await db().posts.refreshEmbeds('author');

    expect(stats.matched).toBe(1);
    expect(stats.updated).toBe(1);
    expect(stats.errors).toBe(0);

    // Verify updates were persisted
    const post = await db().posts.findOne({});
    if (Array.isArray(post?.author)) throw new Error('Expected single embed');
    expect(post?.author?.name).toBe('Charlie Updated');
    expect(post?.author?.bio).toBe('Senior Writer');
  });

  it('should support batch processing with filter', async () => {
    const authors = mongoCollection('authors', {
      _id: objectId().internalId(),
      name: string(),
    });

    const posts = mongoCollection(
      'posts',
      {
        _id: objectId().internalId(),
        title: string(),
        status: string(),
        authorId: objectId(),
      },
      {
        relations: {
          author: embed(authors, {
            forward: {
              from: 'authorId',
              fields: ['name'],
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ authors, posts });

    const author = await db().authors.create({ name: 'Dave' });

    await db().posts.create({
      title: 'Published Post',
      status: 'published',
      authorId: author._id,
    });

    await db().posts.create({
      title: 'Draft Post',
      status: 'draft',
      authorId: author._id,
    });

    // Update author
    await db().authors.rawCollection().updateOne(
      { _id: author._id },
      { $set: { name: 'Dave Updated' } },
    );

    // Refresh only published posts
    const stats = await db().posts.refreshEmbeds('author', {
      filter: { status: 'published' },
      batchSize: 10,
    });

    expect(stats.matched).toBe(1); // Only 1 published post
    expect(stats.updated).toBe(1);

    // Check published post was updated
    const published = await db().posts.findOne({ status: 'published' });
    if (Array.isArray(published?.author)) throw new Error('Expected single embed');
    expect(published?.author?.name).toBe('Dave Updated');

    // Check draft post was NOT updated
    const draft = await db().posts.findOne({ status: 'draft' });
    if (Array.isArray(draft?.author)) throw new Error('Expected single embed');
    expect(draft?.author?.name).toBe('Dave'); // Still old value
  });

  it('should support dry-run mode', async () => {
    const authors = mongoCollection('authors', {
      _id: objectId().internalId(),
      name: string(),
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
              fields: ['name'],
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ authors, posts });

    const author = await db().authors.create({ name: 'Eve' });
    await db().posts.create({
      title: 'Post',
      authorId: author._id,
    });

    // Update author
    await db().authors.rawCollection().updateOne(
      { _id: author._id },
      { $set: { name: 'Eve Updated' } },
    );

    // Dry-run refresh
    const stats = await db().posts.refreshEmbeds('author', {
      dryRun: true,
    });

    expect(stats.matched).toBe(1);
    expect(stats.updated).toBe(1); // Counted as "would update"

    // Verify NO changes were persisted
    const post = await db().posts.findOne({});
    if (Array.isArray(post?.author)) throw new Error('Expected single embed');
    expect(post?.author?.name).toBe('Eve'); // Still old value
  });
});
