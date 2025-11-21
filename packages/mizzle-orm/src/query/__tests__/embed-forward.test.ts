/**
 * Forward EMBED relations tests - Core functionality
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, array, object, objectId } from '../../schema/fields';
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
          fields: ['name', 'color'],
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
          fields: ['name', 'type'],
        },
      }),
    },
  },
);

describe('Forward Embeds - Simple', () => {
  it('should embed referenced document on create', async () => {

    const orm = await createTestOrm({ authors, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const author = await db.authors.create({
      name: 'Alice',
      email: 'alice@example.com',
      bio: 'Loves writing',
    });

    const post = await db.posts.create({
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

    await orm.close();
  });
});

describe('Forward Embeds - Array', () => {
  it('should embed multiple documents from array of IDs', async () => {
    const orm = await createTestOrm({ tags, posts2 });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const tag1 = await db.tags.create({
      name: 'Tech',
      color: 'blue',
    });

    const tag2 = await db.tags.create({
      name: 'News',
      color: 'red',
    });

    const post = await db.posts2.create({
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

    await orm.close();
  });
});

describe('Forward Embeds - In-Place', () => {
  it('should merge embed into existing object', async () => {
    const orm = await createTestOrm({ directories, workflows });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    const directory = await db.directories.create({
      name: 'Legal',
      type: 'department',
    });

    const workflow = await db.workflows.create({
      name: 'Approval Process',
      directory: {
        _id: directory._id,
      },
    });

    expect(workflow.directory.name).toBe('Legal');
    expect(workflow.directory.type).toBe('department');

    await orm.close();
  });
});
