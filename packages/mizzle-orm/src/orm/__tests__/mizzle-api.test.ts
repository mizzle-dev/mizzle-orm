/**
 * Test the new mizzle() API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mongoCollection } from '../../collection/collection';
import { string, objectId } from '../../schema/fields';
import { lookup } from '../../collection/relations';
import { defineSchema, mizzle } from '../orm';
import type { Mizzle } from '../../types/orm';
import { teardownTestDb, setupTestDb } from '../../test/setup';

describe('mizzle() API', () => {
  // Define schema
  const organizations = mongoCollection('test_orgs_mizzle', {
    name: string(),
  });

  const users = mongoCollection(
    'test_users_mizzle',
    {
      name: string(),
      email: string(),
      organizationId: objectId().optional(),
    },
    {
      relations: {
        organization: lookup(organizations, {
          localField: 'organizationId',
          foreignField: '_id',
          one: true,
        }),
      },
    }
  );

  const posts = mongoCollection(
    'test_posts_mizzle',
    {
      title: string(),
      authorId: objectId(),
    },
    {
      relations: {
        author: lookup(users, {
          localField: 'authorId',
          foreignField: '_id',
          one: true,
        }),
      },
    }
  );

  const schema = defineSchema({
    organizations,
    users,
    posts,
  });

  let db!: Mizzle<typeof schema>;

  beforeAll(async () => {
    const { uri } = await setupTestDb();
    db = await mizzle({
      uri,
      dbName: 'test',
      schema,
    });
  });

  afterAll(async () => {
    await db.close();
    await teardownTestDb();
  });

  it('should create callable db instance', async () => {
    // db should be callable
    expect(typeof db).toBe('function');

    // db should have properties
    expect(db.schema).toBeDefined();
    expect(db.client).toBeDefined();
    expect(db.tx).toBeDefined();
    expect(db.close).toBeDefined();
    expect(db._orm).toBeDefined();

    // Schema should match what we defined
    expect(db.schema.users).toBe(users);
    expect(db.schema.posts).toBe(posts);
    expect(db.schema.organizations).toBe(organizations);
  });

  it('should work with context using callable syntax', async () => {
    const org = await db().organizations.create({ name: 'Test Org' });
    const user = await db({ user: { id: 'test' } }).users.create({
      name: 'Test User',
      email: 'test@example.com',
      organizationId: org._id,
    });

    expect(user.name).toBe('Test User');
    expect(user.organizationId).toEqual(org._id);
  });

  it('should have perfect type inference with nested includes', async () => {
    const org = await db().organizations.create({ name: 'Test Org' });
    const user = await db().users.create({
      name: 'Test User',
      email: 'test@example.com',
      organizationId: org._id,
    });
    const post = await db().posts.create({
      title: 'Test Post',
      authorId: user._id,
    });

    const result = await db().posts.findMany({}, {
      include: {
        author: {
          include: {
            organization: true,
          },
        },
      },
    });

    const firstPost = result[0];
    expect(firstPost).toBeDefined();

    if (firstPost) {
      // Type assertions - should NOT be any!
      const authorName: string | undefined = firstPost.author?.name;
      // @ts-expect-error - should not accept number if properly typed
      const authorNameWrong: number = firstPost.author?.name;

      const orgName: string | undefined = firstPost.author?.organization?.name;
      // @ts-expect-error - should not accept number if properly typed
      const orgNameWrong: number = firstPost.author?.organization?.name;

      // Runtime assertions
      expect(authorName).toBe('Test User');
      expect(orgName).toBe('Test Org');

      // Silence unused variable warnings
      console.log(authorNameWrong, orgNameWrong);
    }
  });

  it('should work with transactions', async () => {
    await db.tx({}, async (txOrm) => {
      const user = await txOrm({}).users.create({
        name: 'TX User',
        email: 'tx@example.com',
      });

      expect(user.name).toBe('TX User');
    });

    // Verify the user was created
    const users = await db().users.findMany({ email: 'tx@example.com' });
    expect(users).toHaveLength(1);
    expect(users[0]?.name).toBe('TX User');
  });

  it('should expose raw client', () => {
    expect(db.client).toBeDefined();
    expect(db.client.db).toBeDefined();
  });
});
