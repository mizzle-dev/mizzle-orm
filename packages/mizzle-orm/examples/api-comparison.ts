/**
 * API Comparison: Old vs New
 *
 * This example shows the difference between the old createMongoOrm()
 * API and the new mizzle() API.
 */

import { mongoCollection, defineCollections, createMongoOrm, defineSchema, mizzle } from '../src';
import { string, objectId } from '../src/schema/fields';
import { lookup } from '../src/collection/relations';

// Define collections (same for both APIs)
const users = mongoCollection('users', {
  name: string(),
  email: string(),
});

const posts = mongoCollection(
  'posts',
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

// ============================================================
// OLD API: createMongoOrm()
// ============================================================

async function oldApi() {
  // 1. Define collections
  const collections = defineCollections({ users, posts });

  // 2. Create ORM
  const orm = await createMongoOrm({
    uri: 'mongodb://localhost:27017',
    dbName: 'test',
    collections,
  });

  // 3. Create context
  const context = orm.createContext({
    user: { id: 'user-123', role: 'admin' },
  });

  // 4. Get database facade
  const db = orm.withContext(context);

  // 5. Now you can query
  const postsWithAuthors = await db.posts.findMany(
    {},
    {
      include: {
        author: true,
      },
    }
  );

  console.log('Old API - Posts:', postsWithAuthors.length);

  // For transactions
  await orm.tx({}, async (txOrm) => {
    const txContext = orm.createContext({});
    const txDb = txOrm.withContext(txContext);
    await txDb.users.create({ name: 'Alice', email: 'alice@example.com' });
  });

  await orm.close();
}

// ============================================================
// NEW API: mizzle() - S+ Tier DX
// ============================================================

async function newApi() {
  // 1. Define schema (clearer name)
  const schema = defineSchema({ users, posts });

  // 2. Create database instance (one step!)
  const db = await mizzle({
    uri: 'mongodb://localhost:27017',
    dbName: 'test',
    schema,
  });

  // 3. Query with context using callable syntax
  const postsWithAuthors = await db({ user: { id: 'user-123', role: 'admin' } }).posts.findMany(
    {},
    {
      include: {
        author: true,
      },
    }
  );

  console.log('New API - Posts:', postsWithAuthors.length);

  // For transactions - cleaner!
  await db.tx({}, async (txDb) => {
    await txDb().users.create({ name: 'Alice', email: 'alice@example.com' });
  });

  await db.close();
}

// ============================================================
// Side-by-Side Comparison
// ============================================================

console.log(`
┌──────────────────────────────────────────────────────────────────┐
│                      API COMPARISON                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  OLD API (createMongoOrm):                                       │
│  ────────────────────────────                                    │
│                                                                   │
│  1. const collections = defineCollections({ users, posts });     │
│  2. const orm = await createMongoOrm({ uri, dbName, collections });
│  3. const context = orm.createContext({ user });                 │
│  4. const db = orm.withContext(context);                         │
│  5. await db.posts.findMany({});                                 │
│                                                                   │
│  ❌ 4 steps to get started                                       │
│  ❌ Verbose context creation                                     │
│  ❌ Separate ORM and facade concepts                             │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  NEW API (mizzle) - S+ Tier DX:                                  │
│  ───────────────────────────────                                 │
│                                                                   │
│  1. const schema = defineSchema({ users, posts });               │
│  2. const db = await mizzle({ uri, dbName, schema });            │
│  3. await db({ user }).posts.findMany({});                       │
│                                                                   │
│  ✅ 2 steps to get started                                       │
│  ✅ Callable context: db({ context })                            │
│  ✅ Clean, unified API surface                                   │
│  ✅ Perfect type inference                                       │
│  ✅ Drizzle-inspired design                                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

Key Improvements:
─────────────────

1. Simpler Setup
   OLD: defineCollections → createMongoOrm → createContext → withContext
   NEW: defineSchema → mizzle → done!

2. Better Naming
   OLD: "collections" parameter
   NEW: "schema" parameter (clearer semantics)

3. Callable Context
   OLD: orm.createContext({ user }); db = orm.withContext(context)
   NEW: db({ user }) - clean and intuitive!

4. Unified Instance
   OLD: orm.rawClient(), orm.tx(), orm.close()
   NEW: db.client, db.tx, db.close - all on one object

5. Cleaner Transactions
   OLD: await orm.tx({}, async (txOrm) => {
          const txCtx = orm.createContext({});
          const txDb = txOrm.withContext(txCtx);
          await txDb.users.create(...);
        });
   NEW: await db.tx({}, async (txDb) => {
          await txDb().users.create(...);
        });

6. Type Inference
   Both have perfect type inference, but the new API is cleaner:
   OLD: type ORM = InferOrm<typeof collections>
   NEW: type DB = Mizzle<typeof schema> - or just typeof db

Migration Guide:
────────────────

If you're using the old API, here's how to migrate:

OLD:
  const collections = defineCollections({ users, posts });
  const orm = await createMongoOrm({ uri, dbName, collections });
  const db = orm.withContext(orm.createContext({}));
  const client = orm.rawClient();
  await orm.close();

NEW:
  const schema = defineSchema({ users, posts });
  const db = await mizzle({ uri, dbName, schema });
  const facade = db();
  const client = db.client;
  await db.close();

The old API still works for backward compatibility!
`);
