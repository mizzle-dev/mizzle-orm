/**
 * Relations example - Showcasing the new include API
 */

import {
  mongoCollection,
  objectId,
  string,
  number,
  date,
  mizzle,
  defineSchema,
  lookup,
} from '../src/index';

// ============ COLLECTIONS ============

// Organizations
const organizations = mongoCollection('organizations', {
  _id: objectId().internalId(),
  name: string(),
  createdAt: date().defaultNow(),
});

// Users with REFERENCE to organizations
const users = mongoCollection(
  'users',
  {
    _id: objectId().internalId(),
    email: string().email(),
    name: string(),
    orgId: objectId(), // Foreign key to organizations
    createdAt: date().defaultNow(),
  },
  {
    relations: {
      // LOOKUP: Populates organization data
      organization: lookup(organizations, {
        localField: 'orgId',
        foreignField: '_id',
        one: true,
      }),
    },
  }
);

// Posts with REFERENCE and LOOKUP to users
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    content: string(),
    authorId: objectId(), // Foreign key to users
    likes: number().default(0),
    createdAt: date().defaultNow(),
  },
  {
    relations: {
      // LOOKUP: Populates author data
      author: lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
    },
  }
);

// Comments with nested LOOKUP
const comments = mongoCollection(
  'comments',
  {
    _id: objectId().internalId(),
    postId: objectId(),
    authorId: objectId(),
    content: string(),
    createdAt: date().defaultNow(),
  },
  {
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
  }
);

// ============ USAGE EXAMPLE ============

async function relationsExample() {
  // Connect to MongoDB
  const schema = defineSchema({
    organizations,
    users,
    posts,
    comments,
  });

  const db = await mizzle({
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: 'mizzle_relations_example',
    schema,
  });


  try {
    console.log('\n🎉 World-Class Relations API Demo\n');

    // 1. SETUP: Create test data
    console.log('=== Setup ===');
    const org = await db().organizations.create({
      name: 'Acme Corp',
    });
    console.log('Created org:', org.name);

    const user = await db().users.create({
      email: 'alice@acme.com',
      name: 'Alice',
      orgId: org._id,
    });
    console.log('Created user:', user.name);

    const post = await db().posts.create({
      title: 'My First Post',
      content: 'Hello, World!',
      authorId: user._id,
    });
    console.log('Created post:', post.title);

    await db().comments.create({
      postId: post._id,
      authorId: user._id,
      content: 'Great post!',
    });
    console.log('Created comment');

    // 2. SINGLE INCLUDE - Simple and clean!
    console.log('\n=== Single Include ===');
    const postsWithAuthor = await db().posts.findMany({}, { include: 'author' });

    console.log('Post:', postsWithAuthor[0].title);
    console.log('Author:', postsWithAuthor[0].author?.name); // ✅ Perfect autocomplete!
    console.log('Author Email:', postsWithAuthor[0].author?.email);

    // 3. MULTIPLE INCLUDES - Natural object syntax!
    console.log('\n=== Multiple Includes ===');
    const commentsPopulated = await db().comments.findMany(
      {},
      {
        include: {
          post: true,
          author: true,
        },
      }
    );

    console.log('Comment:', commentsPopulated[0].content);
    console.log('On post:', commentsPopulated[0].post?.title); // ✅ Fully typed!
    console.log('By:', commentsPopulated[0].author?.name); // ✅ Fully typed!

    // 4. NESTED INCLUDES - The power feature! 🚀
    console.log('\n=== Nested Includes (Coming Soon) ===');
    console.log('Nested includes will support queries like:');
    console.log(`
    const postsWithAuthorAndOrg = await db().posts.findMany({}, {
      include: {
        author: {
          include: {
            organization: true
          }
        }
      }
    });

    // Access: postsWithAuthorAndOrg[0].author?.organization?.name
    `);

    console.log('\n✅ All includes use single MongoDB $lookup queries!');
    console.log('✅ Perfect TypeScript inference!');
  } finally {
    await db.close();
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
