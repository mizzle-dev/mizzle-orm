/**
 * Tests for advanced include features:
 * - Nested includes
 * - Field selection (array and projection syntax)
 * - Include filters (where, sort, limit)
 * - Default relation options
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient, Db, ObjectId as MongoObjectId } from 'mongodb';
import {
  mongoCollection,
  createMongoOrm,
  lookup,
  objectId,
  string,
  date,
  number,
  boolean as booleanField,
  object as objectField,
  InferOrm,
  defineCollections,
} from '../../index';

describe('Advanced Include Features', () => {
  let client: MongoClient;
  let testDb: Db;

  // ============================================================
  // Setup Collections
  // ============================================================

  const industries = mongoCollection('test_industries', {
    _id: objectId().internalId(),
    name: string(),
    description: string(),
  });

  const organizations = mongoCollection('test_organizations', {
    _id: objectId().internalId(),
    name: string(),
    industryId: objectId(),
    website: string(),
    employeeCount: number().int(),
    active: booleanField(),
    createdAt: date().defaultNow(),
  }, {
    relations: {
      industry: lookup(industries, {
        localField: 'industryId',
        foreignField: '_id',
        one: true,
      }),
    },
  });

  const users = mongoCollection('test_users', {
    _id: objectId().internalId(),
    name: string(),
    email: string(),
    password: string(),
    organizationId: objectId(),
    role: string(),
    active: booleanField(),
    profile: objectField({
      bio: string(),
      avatar: string(),
    }),
    createdAt: date().defaultNow(),
  }, {
    relations: {
      // With default options
      organization: lookup(organizations, {
        localField: 'organizationId',
        foreignField: '_id',
        one: true,
        select: ['name', 'website'], // Default select
        where: { active: true },      // Default where
      }),
    },
  });

  const posts = mongoCollection('test_posts', {
    _id: objectId().internalId(),
    title: string(),
    content: string(),
    authorId: objectId(),
    published: booleanField(),
    viewCount: number().int(),
    createdAt: date().defaultNow(),
  }, {
    relations: {
      author: lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
    },
  });

  const comments = mongoCollection('test_comments', {
    _id: objectId().internalId(),
    postId: objectId(),
    authorId: objectId(),
    content: string(),
    approved: booleanField(),
    likes: number().int().default(0),
    createdAt: date().defaultNow(),
  }, {
    relations: {
      post: lookup(posts, {
        localField: 'postId',
        foreignField: '_id',
        one: true,
      }),
      author: lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
    },
  });

  const collections = defineCollections({
    industries,
    organizations,
    users,
    posts,
    comments,
  });

  let orm!: InferOrm<typeof collections>;

  // ============================================================
  // Test Setup
  // ============================================================

  beforeAll(async () => {
    const mongoUri = 'mongodb://localhost:27017';
    client = new MongoClient(mongoUri);
    await client.connect();
    testDb = client.db('mizzle_test_include_features');

    orm = await createMongoOrm({
      client,
      dbName: 'mizzle_test_include_features',
      collections,
    });

    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    // Create test data
    const industry = await db.industries.create({
      name: 'Technology',
      description: 'Tech companies',
    });

    const org1 = await db.organizations.create({
      name: 'Acme Corp',
      industryId: industry._id,
      website: 'https://acme.com',
      employeeCount: 100,
      active: true,
    });

    const org2 = await db.organizations.create({
      name: 'Inactive Corp',
      industryId: industry._id,
      website: 'https://inactive.com',
      employeeCount: 50,
      active: false,
    });

    const user1 = await db.users.create({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'hashed_password',
      organizationId: org1._id,
      role: 'admin',
      active: true,
      profile: {
        bio: 'Engineer',
        avatar: 'https://avatar.com/alice',
      },
    });

    const user2 = await db.users.create({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'hashed_password',
      organizationId: org2._id,
      role: 'user',
      active: true,
      profile: {
        bio: 'Designer',
        avatar: 'https://avatar.com/bob',
      },
    });

    const post1 = await db.posts.create({
      title: 'First Post',
      content: 'Content 1',
      authorId: user1._id,
      published: true,
      viewCount: 100,
    });

    const post2 = await db.posts.create({
      title: 'Second Post',
      content: 'Content 2',
      authorId: user2._id,
      published: true,
      viewCount: 50,
    });

    await db.comments.create({
      postId: post1._id,
      authorId: user1._id,
      content: 'Great post!',
      approved: true,
      likes: 10,
    });

    await db.comments.create({
      postId: post1._id,
      authorId: user2._id,
      content: 'Thanks for sharing',
      approved: true,
      likes: 5,
    });

    await db.comments.create({
      postId: post1._id,
      authorId: user1._id,
      content: 'Pending comment',
      approved: false,
      likes: 0,
    });

    await db.comments.create({
      postId: post2._id,
      authorId: user1._id,
      content: 'Nice work',
      approved: true,
      likes: 3,
    });
  });

  afterAll(async () => {
    await testDb.dropDatabase();
    await client.close();
    await orm.close();
  });

  // ============================================================
  // Nested Includes Tests
  // ============================================================

  describe('Nested Includes', () => {
    it('should support 2-level nested includes', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            include: {
              organization: true,
            },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      expect(post.author).toBeDefined();
      expect(post.author?.organization).toBeDefined();
      expect(post.author?.organization?.name).toBeDefined();
    });

    it('should support 3-level nested includes', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const comments = await db.comments.findMany({}, {
        include: {
          post: {
            include: {
              author: {
                include: {
                  organization: true,
                },
              },
            },
          },
        },
      });

      expect(comments.length).toBeGreaterThan(0);
      const comment = comments[0];
      expect(comment.post).toBeDefined();
      expect(comment.post?.author).toBeDefined();
      expect(comment.post?.author?.organization).toBeDefined();
      expect(comment.post?.author?.organization?.name).toBeDefined();
    });

    it('should support multiple nested includes at same level', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const comments = await db.comments.findMany({}, {
        include: {
          post: {
            include: {
              author: true,
            },
          },
          author: {
            include: {
              organization: true,
            },
          },
        },
      });

      expect(comments.length).toBeGreaterThan(0);
      const comment = comments[0];
      expect(comment.post).toBeDefined();
      expect(comment.post?.author).toBeDefined();
      expect(comment.author).toBeDefined();
      expect(comment.author?.organization).toBeDefined();
    });
  });

  // ============================================================
  // Field Selection Tests
  // ============================================================

  describe('Field Selection', () => {
    it('should support array syntax for field selection', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            select: ['name', 'email'],
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      expect(post.author).toBeDefined();
      expect(post.author?.name).toBeDefined();
      expect(post.author?.email).toBeDefined();
      expect(post.author?._id).toBeDefined(); // _id always included
      // Password should not be included
      expect((post.author as any)?.password).toBeUndefined();
    });

    it('should support nested field paths in array syntax', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            select: ['name', 'profile.avatar'],
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      expect(post.author).toBeDefined();
      expect(post.author?.name).toBeDefined();
      expect((post.author as any)?.profile?.avatar).toBeDefined();
    });

    it('should support MongoDB projection syntax for field selection', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            select: {
              name: 1,
              email: 1,
              password: 0, // Explicitly exclude
            },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      expect(post.author).toBeDefined();
      expect(post.author?.name).toBeDefined();
      expect(post.author?.email).toBeDefined();
      expect((post.author as any)?.password).toBeUndefined();
    });

    it('should combine field selection with nested includes', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            select: ['name', 'email', 'organizationId'],
            include: {
              organization: {
                select: ['name'],
              },
            },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      expect(post.author).toBeDefined();
      expect(post.author?.name).toBeDefined();
      expect(post.author?.organization).toBeDefined();
      expect(post.author?.organization?.name).toBeDefined();
      // Website should not be included
      expect((post.author?.organization as any)?.website).toBeUndefined();
    });
  });

  // ============================================================
  // Include Filters Tests
  // ============================================================

  describe('Include Filters', () => {
    it('should filter related documents with where clause', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            where: { role: 'admin' },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      for (const post of posts) {
        if (post.author) {
          expect(post.author.role).toBe('admin');
        }
      }
    });

    it('should sort related documents', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            sort: { createdAt: -1 },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      // Just verify it doesn't error
      expect(posts[0].author).toBeDefined();
    });

    it('should limit related documents', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Note: limit doesn't make sense for `one: true` relations,
      // but it should still work without error
      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            limit: 1,
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      expect(posts[0].author).toBeDefined();
    });

    it('should combine where + sort + limit', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            where: { active: true },
            sort: { name: 1 },
            limit: 10,
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      for (const post of posts) {
        if (post.author) {
          expect(post.author.active).toBe(true);
        }
      }
    });

    it('should combine all options: select + where + sort + limit + nested includes', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const posts = await db.posts.findMany({}, {
        include: {
          author: {
            select: ['name', 'email', 'role', 'organizationId'],
            where: { active: true },
            sort: { name: 1 },
            include: {
              organization: {
                select: ['name', 'website'],
              },
            },
          },
        },
      });

      expect(posts.length).toBeGreaterThan(0);
      const post = posts[0];
      if (post.author) {
        expect(post.author.name).toBeDefined();
        expect(post.author.email).toBeDefined();
        expect(post.author.active).toBe(true);
        expect((post.author as any).password).toBeUndefined();
        if (post.author.organization) {
          expect(post.author.organization.name).toBeDefined();
          expect((post.author.organization as any).employeeCount).toBeUndefined();
        }
      }
    });
  });

  // ============================================================
  // Default Relation Options Tests
  // ============================================================

  describe('Default Relation Options', () => {
    it('should use default select from relation definition', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const users = await db.users.findMany({}, {
        include: 'organization', // Use default options
      });

      expect(users.length).toBeGreaterThan(0);
      const user = users[0];
      if (user.organization) {
        // Default select: ['name', 'website']
        expect(user.organization.name).toBeDefined();
        expect((user.organization as any).website).toBeDefined();
        // employeeCount not in default select
        expect((user.organization as any).employeeCount).toBeUndefined();
      }
    });

    it('should use default where from relation definition', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const users = await db.users.findMany({}, {
        include: 'organization', // Use default options
      });

      expect(users.length).toBeGreaterThan(0);
      // Default where: { active: true }
      // User with inactive org should have null organization
      for (const user of users) {
        if (user.organization) {
          // If organization exists, it must be active (due to default where)
          const orgId = user.organizationId;
          const org = await db.organizations.findById(orgId);
          if (org) {
            // Only active orgs should be included
            expect(org.active).toBe(true);
          }
        }
      }
    });

    it('should override default select with query-time select', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const users = await db.users.findMany({}, {
        include: {
          organization: {
            select: ['name', 'employeeCount'], // Override default
          },
        },
      });

      expect(users.length).toBeGreaterThan(0);
      const user = users[0];
      if (user.organization) {
        expect(user.organization.name).toBeDefined();
        expect((user.organization as any).employeeCount).toBeDefined();
        // Website was in default but not in override
        expect((user.organization as any).website).toBeUndefined();
      }
    });

    it('should AND query-time where with default where', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      const users = await db.users.findMany({}, {
        include: {
          organization: {
            // Default where: { active: true }
            // Query where: { employeeCount: { $gte: 100 } }
            // Combined: active=true AND employeeCount>=100
            where: { employeeCount: { $gte: 100 } },
          },
        },
      });

      expect(users.length).toBeGreaterThan(0);
      for (const user of users) {
        if (user.organization) {
          const org = await db.organizations.findById(user.organizationId);
          expect(org?.active).toBe(true);
          expect(org?.employeeCount).toBeGreaterThanOrEqual(100);
        }
      }
    });
  });
});
