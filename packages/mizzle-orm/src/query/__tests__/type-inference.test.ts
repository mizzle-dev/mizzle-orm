/**
 * Type inference tests - these will fail to compile if types are wrong
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mongoCollection } from '../../collection/collection';
import { string, objectId } from '../../schema/fields';
import { lookup } from '../../collection/relations';
import { defineSchema } from '../../orm/orm';
import type { Mizzle } from '../../types/orm';
import { teardownTestDb, createTestOrm } from '../../test/setup';

describe('Type Inference', () => {
  // Organizations
  const organizations = mongoCollection('test_orgs_ti', {
    name: string(),
  });

  // Users with organization relation
  const users = mongoCollection(
    'test_users_ti',
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

  // Posts with author relation
  const posts = mongoCollection(
    'test_posts_ti',
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

  // Comments with author and post relations
  const comments = mongoCollection(
    'test_comments_ti',
    {
      text: string(),
      authorId: objectId(),
      postId: objectId(),
    },
    {
      relations: {
        author: lookup(users, {
          localField: 'authorId',
          foreignField: '_id',
          one: true,
        }),
        post: lookup(posts, {
          localField: 'postId',
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
    comments,
  });

  let db!: Mizzle<typeof schema>;

  beforeAll(async () => {
    db = await createTestOrm(schema);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should infer types correctly for nested includes', async () => {
    // Create test data
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
    const comment = await db().comments.create({
      text: 'Test Comment',
      authorId: user._id,
      postId: post._id,
    });

    // Fetch with nested includes
    const result = await db().comments.findMany({}, {
      include: {
        author: {
          include: {
            organization: true,
          },
        },
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

    const firstComment = result[0];
    expect(firstComment).toBeDefined();

    // Type assertions that will fail to compile if types are wrong
    if (firstComment) {
      // These should all be properly typed, not `any`!
      // If they were `any`, we could assign them to `number` without error

      // Test 1: author.name should be string | undefined
      const authorName: string | undefined = firstComment.author?.name;
      // @ts-expect-error - should not accept number if properly typed
      const authorNameWrong: number = firstComment.author?.name;

      // Test 2: author.organization.name should be string | undefined
      const orgName: string | undefined = firstComment.author?.organization?.name;
      // @ts-expect-error - should not accept number if properly typed
      const orgNameWrong: number = firstComment.author?.organization?.name;

      // Test 3: post.title should be string | undefined
      const postTitle: string | undefined = firstComment.post?.title;
      // @ts-expect-error - should not accept number if properly typed
      const postTitleWrong: number = firstComment.post?.title;

      // Test 4: post.author.organization.name should be string | undefined
      const postAuthorOrgName: string | undefined = firstComment.post?.author?.organization?.name;
      // @ts-expect-error - should not accept number if properly typed
      const postAuthorOrgNameWrong: number = firstComment.post?.author?.organization?.name;

      // Test 5: IsAny utility - should resolve to false, not true
      type IsAny<T> = 0 extends (1 & T) ? true : false;
      type AuthorIsAny = IsAny<typeof firstComment.author>;
      const authorIsAny: AuthorIsAny = false;
      // @ts-expect-error - should not accept true if author is not any
      const authorIsAnyWrong: AuthorIsAny = true;

      // Runtime assertions
      expect(authorName).toBe('Test User');
      expect(orgName).toBe('Test Org');
      expect(postTitle).toBe('Test Post');
      expect(postAuthorOrgName).toBe('Test Org');
      expect(authorIsAny).toBe(false);

      // Silence unused variable warnings
      console.log(authorNameWrong, orgNameWrong, postTitleWrong, postAuthorOrgNameWrong, authorIsAnyWrong);
    }
  });

  it('should show exact type in db facade', () => {
    // Type check: db().comments should have proper type, not CollectionFacade<any, any, any, any>
    type CommentsFacade = typeof db extends (...args: any[]) => infer R ? R extends { comments: infer C } ? C : never : never;
    type IsAny<T> = 0 extends (1 & T) ? true : false;
    type IsCommentsAny = IsAny<CommentsFacade>;

    const isAny: IsCommentsAny = false;
    // @ts-expect-error - should not be any
    const isAnyWrong: IsCommentsAny = true;

    expect(isAny).toBe(false);
    console.log(isAnyWrong);
  });

  it('should properly narrow types when using projection syntax', async () => {
    // Create test data
    const org = await db().organizations.create({ name: 'Test Org' });
    const user = await db().users.create({
      name: 'Test User',
      email: 'test@example.com',
      organizationId: org._id,
    });
    await db().posts.create({
      title: 'Test Post',
      authorId: user._id,
    });

    // Fetch with projection limiting fields
    const posts = await db().posts.findMany({}, {
      include: {
        author: {
          projection: { name: 1, email: 1 }, // Only include name and email
        },
      },
    });

    const post = posts[0];
    expect(post).toBeDefined();

    if (post?.author) {
      // These fields SHOULD be accessible (projected + _id)
      const name: string = post.author.name;
      const email: string = post.author.email;
      const id = post.author._id; // _id is always included

      // These fields should NOT be accessible (not projected)
      // @ts-expect-error - organizationId was not projected
      const orgId = post.author.organizationId;

      // Runtime assertions
      expect(name).toBe('Test User');
      expect(email).toBe('test@example.com');
      expect(id).toBeDefined();

      // Silence unused variable warnings
      console.log(orgId);
    }
  });

  it('should handle nested projections with proper type narrowing', async () => {
    // Create test data
    const org = await db().organizations.create({ name: 'Test Org' });
    const user = await db().users.create({
      name: 'Test User',
      email: 'test@example.com',
      organizationId: org._id,
    });
    await db().posts.create({
      title: 'Test Post',
      authorId: user._id,
    });

    // Fetch with nested projection
    const posts = await db().posts.findMany({}, {
      include: {
        author: {
          projection: { name: 1, organizationId: 1 }, // Include organizationId for nested include
          include: {
            organization: {
              projection: { name: 1 }, // Only include name from organization
            },
          },
        },
      },
    });

    const post = posts[0];
    expect(post).toBeDefined();

    if (post?.author?.organization) {
      // Organization should only have _id and name
      const orgName: string = post.author.organization.name;
      const orgId = post.author.organization._id; // _id always included

      // These fields should NOT be accessible
      // Note: We can't use @ts-expect-error here because organizations only has 'name' field

      // Runtime assertions
      expect(orgName).toBe('Test Org');
      expect(orgId).toBeDefined();
    }

    // Author should only have name, organizationId, and _id
    if (post?.author) {
      const authorName: string = post.author.name;
      const authorOrgId = post.author.organizationId;

      // @ts-expect-error - email was not projected
      const email = post.author.email;

      expect(authorName).toBe('Test User');
      expect(authorOrgId).toBeDefined();

      // Silence unused variable warnings
      console.log(email);
    }
  });

  it('should support MongoDB projection syntax', async () => {
    // Create test data
    const org = await db().organizations.create({ name: 'Test Org' });
    const user = await db().users.create({
      name: 'Test User',
      email: 'test@example.com',
      organizationId: org._id,
    });
    await db().posts.create({
      title: 'Test Post',
      authorId: user._id,
    });

    // Fetch with projection syntax (include specific fields)
    const posts = await db().posts.findMany({}, {
      include: {
        author: {
          projection: {
            name: 1,
            email: 1,
          },
        },
      },
    });

    const post = posts[0];
    expect(post).toBeDefined();

    if (post?.author) {
      // These fields SHOULD be accessible
      const name: string = post.author.name;
      const email: string = post.author.email;
      const id = post.author._id; // _id always included

      // This field should NOT be accessible
      // @ts-expect-error - organizationId was not projected
      const orgId = post.author.organizationId;

      // Runtime assertions
      expect(name).toBe('Test User');
      expect(email).toBe('test@example.com');
      expect(id).toBeDefined();

      // Silence unused variable warnings
      console.log(orgId);
    }
  });
});
