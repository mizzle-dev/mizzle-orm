/**
 * Forward EMBED relations tests - Core functionality
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, array, object, objectId, publicId } from '../../schema/fields';
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
          projection: { name: 1, email: 1 },
        },
      }),
    },
  },
);

const tags = mongoCollection('tags', {
  _id: objectId().internalId(),
  name: string(),
  color: string(),
});

const posts2 = mongoCollection(
  'posts2',
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
          projection: { name: 1, color: 1 },
        },
      }),
    },
  },
);

const directories = mongoCollection('directories', {
  _id: objectId().internalId(),
  name: string(),
  type: string(),
});

const workflows = mongoCollection(
  'workflows',
  {
    _id: objectId().internalId(),
    name: string(),
    directory: object({
      _id: objectId(),
      name: string().optional(),
      type: string().optional(),
    }),
  },
  {
    relations: {
      directoryEmbed: embed(directories, {
        forward: {
          from: 'directory._id',
          projection: { name: 1, type: 1 },
        },
      }),
    },
  },
);

describe('Forward Embeds - Simple', () => {
  it('should embed referenced document on create', async () => {

    const db = await createTestOrm({ authors, posts });

    const author = await db().authors.create({
      name: 'Alice',
      email: 'alice@example.com',
      bio: 'Loves writing',
    });

    const post = await db().posts.create({
      title: 'My First Post',
      authorId: author._id,
    });

    // TypeScript note: In test contexts, embedded field types may show as unions
    // Runtime behavior is correct - this is a known TS limitation with complex conditional types
    expect(post.author).toBeDefined();
    if (Array.isArray(post.author)) throw new Error('Expected single embed');
    expect(post.author?.name).toBe('Alice');
    expect(post.author?.email).toBe('alice@example.com');
    expect(post.author?._id).toBe(author._id.toHexString());
    expect(post.author).not.toHaveProperty('bio');
  });
});

describe('Forward Embeds - Array', () => {
  it('should embed multiple documents from array of IDs', async () => {
    const db = await createTestOrm({ tags, posts2 });

    const tag1 = await db().tags.create({
      name: 'Tech',
      color: 'blue',
    });

    const tag2 = await db().tags.create({
      name: 'News',
      color: 'red',
    });

    const post = await db().posts2.create({
      title: 'My Post',
      tagIds: [tag1._id, tag2._id],
    });

    // TypeScript note: In test contexts, embedded field types may show as unions
    // Runtime behavior is correct - this is a known TS limitation with complex conditional types
    expect(post.tags).toBeDefined();
    if (!Array.isArray(post.tags)) throw new Error('Expected array embed');
    expect(post.tags).toHaveLength(2);
    expect(post.tags[0].name).toBe('Tech');
    expect(post.tags[0].color).toBe('blue');
    expect(post.tags[1].name).toBe('News');
    expect(post.tags[1].color).toBe('red');
  });
});

describe('Forward Embeds - In-Place', () => {
  it('should merge embed into existing object', async () => {
    const db = await createTestOrm({ directories, workflows });

    const directory = await db().directories.create({
      name: 'Legal',
      type: 'department',
    });

    const workflow = await db().workflows.create({
      name: 'Approval Process',
      directory: {
        _id: directory._id,
      },
    });

    expect(workflow.directory.name).toBe('Legal');
    expect(workflow.directory.type).toBe('department');
  });
});

describe('Forward Embeds - Custom embedIdField', () => {
  it('should embed using publicId instead of _id', async () => {
    // Users with publicId
    const users = mongoCollection('users', {
      id: publicId('usr'), // Public ID field (auto-generated, e.g., "usr_abc123")
      name: string(),
      email: string(),
    });

    // Posts that reference by publicId and embed publicId
    const postsWithPublicId = mongoCollection(
      'postsWithPublicId',
      {
        _id: objectId().internalId(),
        title: string(),
        authorId: string(), // Store publicId as string (e.g., "usr_abc123")
      },
      {
        relations: {
          author: embed(users, {
            forward: {
              from: 'authorId',
              projection: { name: 1, email: 1 },
              embedIdField: 'id', // Embed publicId instead of _id
            },
          }),
        },
      },
    );

    const db = await createTestOrm({ users, postsWithPublicId });

    const user = await db().users.create({
      name: 'Bob',
      email: 'bob@example.com',
    });

    // user.id should be the generated publicId (string like "usr_abc123")
    expect(user.id).toBeDefined();
    expect(typeof user.id).toBe('string');

    const post = await db().postsWithPublicId.create({
      title: 'Public ID Test',
      authorId: user.id, // Reference by publicId
    });

    expect(post.author).toBeDefined();
    if (Array.isArray(post.author)) throw new Error('Expected single embed');

    // The embedded _id should be the publicId (string), not ObjectId
    expect(post.author?._id).toBe(user.id); // publicId, not ObjectId
    expect(typeof post.author?._id).toBe('string');
    expect(post.author?.name).toBe('Bob');
    expect(post.author?.email).toBe('bob@example.com');
  });
});
