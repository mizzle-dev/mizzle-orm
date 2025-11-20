/**
 * Relations example - REFERENCE, LOOKUP, and EMBED
 */

import {
  mongoCollection,
  objectId,
  string,
  number,
  date,
  createMongoOrm,
} from '../src/index';

// ============ COLLECTIONS ============

// Organizations
const organizations = mongoCollection('organizations', {
  name: string(),
  createdAt: date().defaultNow(),
});

// Users with REFERENCE to organizations
const users = mongoCollection(
  'users',
  {
    email: string().email(),
    name: string(),
    orgId: objectId(), // Foreign key to organizations
    createdAt: date().defaultNow(),
  },
  {
    relations: (r) => ({
      // REFERENCE: Validates that orgId points to existing organization
      organization: r.reference(organizations, {
        localField: 'orgId',
        foreignField: '_id',
      }),
      // LOOKUP: Populates organization data
      organizationData: r.lookup(organizations, {
        localField: 'orgId',
        foreignField: '_id',
        one: true, // Single document
      }),
    }),
  }
);

// Posts with REFERENCE and LOOKUP to users
const posts = mongoCollection(
  'posts',
  {
    title: string(),
    content: string(),
    authorId: objectId(), // Foreign key to users
    likes: number().default(0),
    createdAt: date().defaultNow(),
  },
  {
    relations: (r) => ({
      // REFERENCE: Validates authorId exists
      author: r.reference(users, {
        localField: 'authorId',
        foreignField: '_id',
      }),
      // LOOKUP: Populates author data
      authorData: r.lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
    }),
  }
);

// Comments with nested LOOKUP
const comments = mongoCollection(
  'comments',
  {
    postId: objectId(),
    authorId: objectId(),
    content: string(),
    createdAt: date().defaultNow(),
  },
  {
    relations: (r) => ({
      post: r.lookup(posts, {
        localField: 'postId',
        foreignField: '_id',
        one: true,
      }),
      author: r.lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
    }),
  }
);

// ============ USAGE EXAMPLE ============

async function relationsExample() {
  // Connect to MongoDB
  const orm = await createMongoOrm({
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: 'mizzle_relations_example',
    collections: { organizations, users, posts, comments },
  });

  const ctx = orm.createContext({});
  const db = orm.withContext(ctx);

  try {
    // Note: Using `as any` type assertions to work around TypeScript's
    // complexity with union types in multi-collection ORMs.
    // The code is fully type-safe at runtime.

    // 1. REFERENCE VALIDATION
    console.log('\n=== REFERENCE Validation ===');

    // Create an organization
    const org = await db.organizations.create({
      name: 'Acme Corp',
    });
    console.log('Created org:', org.name);

    // Create a user with valid orgId (REFERENCE validates this)
    const user = await db.users.create({
      email: 'alice@acme.com',
      name: 'Alice',
      orgId: org._id, // Must reference existing organization
    });
    console.log('Created user:', user.name);

    // Try to create user with invalid orgId - will throw error
    try {
      const { ObjectId } = await import('mongodb');
      await db.users.create({
        email: 'invalid@example.com',
        name: 'Invalid User',
        orgId: new ObjectId(), // Non-existent org
      });
    } catch (err) {
      console.log('✓ Reference validation caught invalid orgId');
    }

    // 2. LOOKUP POPULATION
    console.log('\n=== LOOKUP Population ===');

    // Create a post
    const post = await db.posts.create({
      title: 'My First Post',
      content: 'Hello, World!',
      authorId: user._id,
    });

    // Fetch post and populate author
    const foundPosts = await db.posts.findMany({ _id: post._id });
    const postsWithAuthor = await db.posts.populate(foundPosts, 'authorData');

    console.log('Post:', postsWithAuthor[0].title);
    console.log('Author:', postsWithAuthor[0].authorData.name);
    console.log('Author Email:', postsWithAuthor[0].authorData.email);

    // 3. MULTIPLE POPULATIONS
    console.log('\n=== Multiple Populations ===');

    // Create some comments
    await db.comments.create({
      postId: post._id,
      authorId: user._id,
      content: 'Great post!',
    });

    // Fetch comments and populate both post and author
    const foundComments = await db.comments.findMany({});
    const populatedComments = await db.comments.populate(foundComments, [
      'post',
      'author',
    ]);

    console.log('Comment:', populatedComments[0].content);
    console.log('On post:', populatedComments[0].post?.title);
    console.log('By:', populatedComments[0].author?.name);

    // 4. NESTED POPULATION (manually)
    console.log('\n=== Nested Population ===');

    // Get posts with authors
    const allPosts = await db.posts.findMany({});
    const postsWithAuthors = await db.posts.populate(allPosts, 'authorData');

    // For each author, populate their organization
    for (const postWithAuthor of postsWithAuthors) {
      const author = postWithAuthor.authorData;
      if (author) {
        const usersArray = [author];
        const usersWithOrg = await db.users.populate(usersArray, 'organizationData');
        postWithAuthor.authorData = usersWithOrg[0];
      }
    }

    console.log('Post:', postsWithAuthors[0].title);
    console.log('Author:', postsWithAuthors[0].authorData?.name);
    console.log('Org:', postsWithAuthors[0].authorData?.organizationData?.name);
  } finally {
    await orm.close();
  }
}

// Run example if called directly
if (require.main === module) {
  relationsExample()
    .then(() => {
      console.log('\n✓ Relations example completed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
