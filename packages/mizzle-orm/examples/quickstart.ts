/**
 * Mizzle Quick Start - 5 Minute Tutorial
 *
 * This example gets you up and running with Mizzle in minutes.
 */

import { mongoCollection, defineSchema, mizzle } from '../src';
import { string, objectId, date } from '../src/schema/fields';
import { lookup } from '../src/collection/relations';

// ============================================================
// Step 1: Define your collections
// ============================================================

// Define a users collection
const users = mongoCollection('users', {
  name: string(),
  email: string(),
  createdAt: date(),
});

// Define a posts collection with a relation to users
const posts = mongoCollection(
  'posts',
  {
    title: string(),
    content: string(),
    authorId: objectId(),
    createdAt: date(),
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

// ============================================================
// Step 2: Create your schema
// ============================================================

const schema = defineSchema({
  users,
  posts,
});

// ============================================================
// Step 3: Connect to MongoDB
// ============================================================

async function quickstart() {
  const db = await mizzle({
    uri: 'mongodb://localhost:27017',
    dbName: 'quickstart',
    schema,
  });

  try {
    // ============================================================
    // Step 4: Create some data
    // ============================================================

    const user = await db().users.create({
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: new Date(),
    });

    console.log('Created user:', user);

    const post = await db().posts.create({
      title: 'Hello Mizzle!',
      content: 'This is my first post with Mizzle ORM',
      authorId: user._id,
      createdAt: new Date(),
    });

    console.log('Created post:', post);

    // ============================================================
    // Step 5: Query with relations (perfectly typed!)
    // ============================================================

    const postsWithAuthors = await db().posts.findMany(
      {},
      {
        include: {
          author: true,
        },
      }
    );

    for (const p of postsWithAuthors) {
      console.log(`\nPost: ${p.title}`);
      console.log(`Author: ${p.author?.name} (${p.author?.email})`);

      // TypeScript knows the exact types!
      const title: string = p.title; // ✅ string
      const authorName: string | undefined = p.author?.name; // ✅ string | undefined

      console.log({ title, authorName });
    }

    // ============================================================
    // Step 6: Update and delete
    // ============================================================

    await db().posts.updateOne({ _id: post._id }, { title: 'Hello Mizzle! (Updated)' });

    console.log('\nUpdated post title');

    const updatedPost = await db().posts.findOne({ _id: post._id });
    console.log('New title:', updatedPost?.title);

    // ============================================================
    // Step 7: Use context for multi-tenancy or auth
    // ============================================================

    const contextualDb = db({
      user: { id: user._id.toString(), role: 'admin' },
    });

    const myPosts = await contextualDb.posts.findMany({});
    console.log(`\nFound ${myPosts.length} posts with context`);

    // ============================================================
    // Step 8: Transactions
    // ============================================================

    await db.tx({}, async (txDb) => {
      await txDb().users.create({
        name: 'Bob',
        email: 'bob@example.com',
        createdAt: new Date(),
      });

      await txDb().posts.create({
        title: 'Another post',
        content: 'Created in a transaction',
        authorId: user._id,
        createdAt: new Date(),
      });

      console.log('\n✓ Transaction committed');
    });

    // ============================================================
    // Done!
    // ============================================================

    console.log('\n🎉 Quickstart complete!');
  } finally {
    await db.close();
  }
}

quickstart().catch(console.error);

/**
 * That's it! You now know:
 *
 * ✓ How to define collections with fields and relations
 * ✓ How to create a schema and connect to MongoDB
 * ✓ How to perform CRUD operations
 * ✓ How to query with nested includes (with perfect types!)
 * ✓ How to use context for multi-tenancy/auth
 * ✓ How to use transactions
 *
 * Next steps:
 * - Check out examples/mizzle-api-example.ts for advanced usage
 * - Read docs/PERFORMANCE_AT_SCALE.md for large schemas
 * - Explore embed relations for denormalization
 */
