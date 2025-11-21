/**
 * Public ID relations tests - verifying string-based ID support
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, publicId } from '../../schema/fields';
import { lookup, reference } from '../../collection/relations';

describe('Public ID Relations', () => {
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
      relations: {
        // REFERENCE: Validates that orgId points to existing organization by public ID
        organization: reference(organizations, {
          localField: 'orgId',
          foreignField: 'id', // References the public ID field
        }),
        // LOOKUP: Populates organization data using public ID
        organizationData: lookup(organizations, {
          localField: 'orgId',
          foreignField: 'id', // Looks up by public ID
          one: true,
        }),
      },
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
      relations: {
        // REFERENCE: Validates authorId exists
        author: reference(users, {
          localField: 'authorId',
          foreignField: 'id', // References the public ID field
        }),
        // LOOKUP: Populates author data using public ID
        authorData: lookup(users, {
          localField: 'authorId',
          foreignField: 'id', // Looks up by public ID
          one: true,
        }),
      },
    }
  );

  let orm: Awaited<ReturnType<typeof setupOrm>>;

  async function setupOrm() {
    return createTestOrm({
      organizations,
      users,
      posts,
    });
  }

  beforeAll(async () => {
    orm = await setupOrm();
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
      const org = await db.organizations.create({
        name: 'Acme Corp',
      });

      expect(org.id).toMatch(/^org_/);

      // Create user with valid public ID reference
      const user = await db.users.create({
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
        db.users.create({
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
      const org = await db.organizations.create({
        name: 'Acme Corp',
      });

      // Create user
      await db.users.create({
        email: 'alice@acme.com',
        name: 'Alice',
        orgId: org.id,
      });

      // Fetch users with organization included
      const users = await db.users.findMany({}, { include: 'organizationData' });

      expect(users[0].organizationData).toBeDefined();
      expect(users[0].organizationData?.id).toBe(org.id);
      expect(users[0].organizationData?.name).toBe('Acme Corp');
    });

    it('should populate nested relations with public IDs', async () => {
      const ctx = orm.createContext({});
      const db = orm.withContext(ctx);

      // Create organization
      const org = await db.organizations.create({
        name: 'Acme Corp',
      });

      // Create user
      const user = await db.users.create({
        email: 'alice@acme.com',
        name: 'Alice',
        orgId: org.id,
      });

      // Create post
      await db.posts.create({
        title: 'My First Post',
        content: 'Hello, World!',
        authorId: user.id, // Public ID
      });

      // Fetch posts with author included
      const posts = await db.posts.findMany({}, { include: 'authorData' });

      expect(posts[0].authorData).toBeDefined();
      expect(posts[0].authorData?.id).toBe(user.id);
      expect(posts[0].authorData?.name).toBe('Alice');

      // Verify we can further query the populated author's organization
      const userWithOrg = await db.users.findOne(
        { id: user.id },
        { include: 'organizationData' }
      );

      expect(userWithOrg).toBeTruthy();
      expect(userWithOrg?.organizationData).toBeDefined();
      expect(userWithOrg?.organizationData?.id).toBe(org.id);
      expect(userWithOrg?.organizationData?.name).toBe('Acme Corp');
    });
  });

  describe('Multiple relation types on same field', () => {
    // Posts that can look up users by public ID
    const postsWithMultiLookup = mongoCollection(
      'posts_multi',
      {
        id: publicId('post'),
        title: string(),
        authorId: string(), // References user public ID
      },
      {
        relations: {
          // Primary lookup by public ID
          authorData: lookup(users, {
            localField: 'authorId',
            foreignField: 'id',
            one: true,
          }),
        },
      }
    );

    it('should support lookup with public IDs across collections', async () => {
      // Create a new ORM with the collection
      const multiOrm = await createTestOrm({
        organizations,
        users,
        posts_multi: postsWithMultiLookup,
      });
      const ctx = multiOrm.createContext({});
      const db = multiOrm.withContext(ctx);

      try {
        // Create organization
        const org = await db.organizations.create({
          name: 'Acme Corp',
        });

        // Create user
        const user = await db.users.create({
          email: 'alice@acme.com',
          name: 'Alice',
          orgId: org.id,
        });

        // Create post with public ID reference
        await db.posts_multi.create({
          title: 'My Post',
          authorId: user.id, // Public ID
        });

        // Fetch with include using public ID
        const posts = await db.posts_multi.findMany({}, { include: 'authorData' });

        expect(posts).toHaveLength(1);
        expect(posts[0].authorData).toBeDefined();
        expect(posts[0].authorData?.id).toBe(user.id);
        expect(posts[0].authorData?.name).toBe('Alice');
      } finally {
        await multiOrm.close();
      }
    });
  });
});
