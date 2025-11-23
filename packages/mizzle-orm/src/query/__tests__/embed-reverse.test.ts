/**
 * Reverse EMBED relations tests - Auto-update embedded data when source changes
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

// Define collections at module level for proper type inference
const authors = mongoCollection('authors', {
  _id: objectId().internalId(),
  name: string(),
  email: string(),
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
          fields: ['name', 'email'],
        },
        keepFresh: true, // Auto-update when author changes
      }),
    },
  },
);

describe('Reverse Embeds - keepFresh', () => {
  it('should auto-update embedded data when source changes', async () => {
    const db = await createTestOrm({ authors, posts });

    // Create author
    const author = await db().authors.create({
      name: 'Alice',
      email: 'alice@example.com',
      bio: 'Loves writing',
    });

    // Create post with embedded author
    const post = await db().posts.create({
      title: 'My First Post',
      authorId: author._id,
    });

    // Verify initial embed
    expect(post.author).toBeDefined();
    if (Array.isArray(post.author)) throw new Error('Expected single embed');
    expect(post.author?.name).toBe('Alice');
    expect(post.author?.email).toBe('alice@example.com');

    // Update author
    const updatedAuthor = await db().authors.updateById(author._id, {
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
    });

    expect(updatedAuthor?.name).toBe('Alice Smith');

    // Fetch post again - embedded data should be updated
    const refreshedPost = await db().posts.findById(post._id);

    expect(refreshedPost).toBeDefined();
    if (Array.isArray(refreshedPost?.author)) throw new Error('Expected single embed');

    // The embedded author should now have the updated data
    expect(refreshedPost?.author?.name).toBe('Alice Smith');
    expect(refreshedPost?.author?.email).toBe('alice.smith@example.com');
    expect(refreshedPost?.author?._id).toBe(author._id.toHexString());

  });

  it('should only update specified fields in watchFields', async () => {
    const tags = mongoCollection('tags', {
      _id: objectId().internalId(),
      name: string(),
      color: string(),
      description: string(),
    });

    const articles = mongoCollection(
      'articles',
      {
        _id: objectId().internalId(),
        title: string(),
        tagId: objectId(),
      },
      {
        relations: {
          tag: embed(tags, {
            forward: {
              from: 'tagId',
              fields: ['name', 'color'],
            },
            reverse: {
              enabled: true,
              watchFields: ['name', 'color'], // Only update if these fields change
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ tags, articles });

    const tag = await db().tags.create({
      name: 'Tech',
      color: 'blue',
      description: 'Technology articles',
    });

    const article = await db().articles.create({
      title: 'Tech Article',
      tagId: tag._id,
    });

    // Initial embed
    expect(article.tag).toBeDefined();
    if (Array.isArray(article.tag)) throw new Error('Expected single embed');
    if (!article.tag) throw new Error('Expected tag to be defined');
    expect(article.tag.name).toBe('Tech');
    expect(article.tag.color).toBe('blue');

    // Update only description (not a watched field)
    await db().tags.updateById(tag._id, {
      description: 'Updated description',
    });

    // Embed should NOT be updated (description is not in watchFields)
    const article1 = await db().articles.findById(article._id);
    if (!article1?.tag || Array.isArray(article1.tag))
      throw new Error('Expected single embed');
    expect(article1.tag.name).toBe('Tech');
    expect(article1.tag.color).toBe('blue');

    // Update a watched field
    await db().tags.updateById(tag._id, {
      name: 'Technology',
    });

    // Embed SHOULD be updated now
    const article2 = await db().articles.findById(article._id);
    if (Array.isArray(article2?.tag)) throw new Error('Expected single embed');
    expect(article2?.tag?.name).toBe('Technology');
    expect(article2?.tag?.color).toBe('blue');

  });
});
