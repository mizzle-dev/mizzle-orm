/**
 * Public ID relations tests - verifying string-based ID support
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, publicId } from '../../schema/fields';
import type { MongoOrm } from '../../types/orm';

describe('Public ID Relations', () => {
  let orm: MongoOrm;

  // Organizations with public IDs
  const organizations = mongoCollection('organizations', {
    id: publicId('org'),
    name: string(),
  });

  // Users with public IDs, referencing organizations by public ID
  const users = mongoCollection(
    'users',
    {
      id: publicId('usr'),
      email: string().email(),
      name: string(),
      orgId: string(), // References organization.id (a public ID)
    },
    {
      relations: (r) => ({
        // REFERENCE: Validates that orgId points to existing organization by public ID
        organization: r.reference(organizations, {
          localField: 'orgId',
          foreignField: 'id', // References the public ID field
        }),
        // LOOKUP: Populates organization data using public ID
        organizationData: r.lookup(organizations, {
          localField: 'orgId',
          foreignField: 'id', // Looks up by public ID
          one: true,
        }),
      }),
    }
  );

  // Posts referencing users by public ID
  const posts = mongoCollection(
    'posts',
    {
      id: publicId('post'),
      title: string(),
      content: string(),
      authorId: string(), // References user.id (a public ID)
    },
    {
      relations: (r) => ({
        // REFERENCE: Validates authorId exists
        author: r.reference(users, {
          localField: 'authorId',
          foreignField: 'id', // References the public ID field
        }),
        // LOOKUP: Populates author data using public ID
        authorData: r.lookup(users, {
          localField: 'authorId',
          foreignField: 'id', // Looks up by public ID
          one: true,
        }),
      }),
    }
  );

  beforeAll(async () => {
    orm = await createTestOrm([organizations, users, posts]);
  });

  afterAll(async () => {
    await orm.close();
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('REFERENCE validation with public IDs', () => {
    it('should validate reference using public ID', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create organization
      const org = await (db.organizations as any).create({
        name: 'Acme Corp',
      });

      expect(org.id).toMatch(/^org_/);

      // Create user with valid public ID reference
      const user = await (db.users as any).create({
        email: 'alice@acme.com',
        name: 'Alice',
        orgId: org.id, // String public ID
      });

      expect(user.id).toMatch(/^usr_/);
      expect(user.orgId).toBe(org.id);
    });

    it('should reject invalid public ID reference', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Try to create user with non-existent public ID
      await expect(
        (db.users as any).create({
          email: 'invalid@example.com',
          name: 'Invalid User',
          orgId: 'org_nonexistent123456',
        })
      ).rejects.toThrow('Invalid reference');
    });
  });

  describe('LOOKUP population with public IDs', () => {
    it('should populate relation using public ID', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create organization
      const org = await (db.organizations as any).create({
        name: 'Acme Corp',
      });

      // Create user
      const user = await (db.users as any).create({
        email: 'alice@acme.com',
        name: 'Alice',
        orgId: org.id,
      });

      // Fetch users and populate organization
      const users = await (db.users as any).findMany({});
      const usersWithOrg = await (db.users as any).populate(users, 'organizationData');

      expect(usersWithOrg[0].organizationData).toBeDefined();
      expect(usersWithOrg[0].organizationData.id).toBe(org.id);
      expect(usersWithOrg[0].organizationData.name).toBe('Acme Corp');
    });

    it('should populate nested relations with public IDs', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create organization
      const org = await (db.organizations as any).create({
        name: 'Acme Corp',
      });

      // Create user
      const user = await (db.users as any).create({
        email: 'alice@acme.com',
        name: 'Alice',
        orgId: org.id,
      });

      // Create post
      const post = await (db.posts as any).create({
        title: 'My First Post',
        content: 'Hello, World!',
        authorId: user.id, // Public ID
      });

      // Fetch posts and populate author
      const posts = await (db.posts as any).findMany({});
      const postsWithAuthor = await (db.posts as any).populate(posts, 'authorData');

      expect(postsWithAuthor[0].authorData).toBeDefined();
      expect(postsWithAuthor[0].authorData.id).toBe(user.id);
      expect(postsWithAuthor[0].authorData.name).toBe('Alice');

      // Further populate the author's organization
      const authors = [postsWithAuthor[0].authorData];
      const authorsWithOrg = await (db.users as any).populate(authors, 'organizationData');

      expect(authorsWithOrg[0].organizationData).toBeDefined();
      expect(authorsWithOrg[0].organizationData.id).toBe(org.id);
      expect(authorsWithOrg[0].organizationData.name).toBe('Acme Corp');
    });
  });

  describe('Mixed ObjectId and public ID relations', () => {
    // Posts with ObjectId reference
    const postsWithObjectId = mongoCollection(
      'posts_objectid',
      {
        id: publicId('post'),
        title: string(),
        authorId: string(), // Can reference either _id or public ID
      },
      {
        relations: (r) => ({
          // This looks up by _id (ObjectId)
          authorByObjectId: r.lookup(users, {
            localField: 'authorId',
            foreignField: '_id',
            one: true,
          }),
          // This looks up by public ID
          authorByPublicId: r.lookup(users, {
            localField: 'authorId',
            foreignField: 'id',
            one: true,
          }),
        }),
      }
    );

    it('should handle string to ObjectId conversion when targeting _id', async () => {
      // Create a new ORM with the mixed collection
      const mixedOrm = await createTestOrm([organizations, users, postsWithObjectId]);
      const ctx = mixedOrm.createContext({});
      const db = mixedOrm.withContext(ctx);

      try {
        // Create organization
        const org = await (db.organizations as any).create({
          name: 'Acme Corp',
        });

        // Create user
        const user = await (db.users as any).create({
          email: 'alice@acme.com',
          name: 'Alice',
          orgId: org.id,
        });

        // Create post with ObjectId as string
        const post = await (db.posts_objectid as any).create({
          title: 'My Post',
          authorId: user._id.toString(), // ObjectId as string
        });

        // Populate using _id (should auto-convert string to ObjectId)
        const posts = await (db.posts_objectid as any).findMany({});
        const postsWithAuthor = await (db.posts_objectid as any).populate(
          posts,
          'authorByObjectId'
        );

        expect(postsWithAuthor[0].authorByObjectId).toBeDefined();
        expect(postsWithAuthor[0].authorByObjectId.id).toBe(user.id);
        expect(postsWithAuthor[0].authorByObjectId.name).toBe('Alice');
      } finally {
        await mixedOrm.close();
      }
    });
  });
});
