# Mizzle ORM

A MongoDB ORM with exceptional developer experience, built for TypeScript.

[![npm version](https://img.shields.io/npm/v/@mizzle-dev/orm.svg)](https://www.npmjs.com/package/@mizzle-dev/orm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Perfect Type Inference** - S+ tier TypeScript support with zero `any` types
- **Flexible Relations** - EMBED (denormalized), LOOKUP (virtual joins), and REFERENCE strategies
- **Auto-updating Embeds** - Optional `keepFresh` mode keeps embedded data synchronized
- **Intuitive API** - Clean, modern syntax with excellent IntelliSense
- **Context Support** - Built-in multi-tenancy and auth context handling
- **Transaction Support** - First-class transaction API
- **Zero Runtime Overhead** - Compile-time type checking with minimal runtime cost

## Installation

```bash
npm install @mizzle-dev/orm mongodb
# or
pnpm add @mizzle-dev/orm mongodb
# or
yarn add @mizzle-dev/orm mongodb
```

**Requirements:** Node.js 20+ and MongoDB driver 6.0+

## Quick Start

```typescript
import { mizzle, defineSchema, mongoCollection } from '@mizzle-dev/orm';
import { string, objectId, date } from '@mizzle-dev/orm';
import { lookup } from '@mizzle-dev/orm';

// Define collections
const users = mongoCollection('users', {
  name: string(),
  email: string(),
  createdAt: date(),
});

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

// Create schema and connect
const schema = defineSchema({ users, posts });
const db = await mizzle({
  uri: 'mongodb://localhost:27017',
  dbName: 'myapp',
  schema,
});

// Create data
const user = await db().users.create({
  name: 'Alice',
  email: 'alice@example.com',
  createdAt: new Date(),
});

const post = await db().posts.create({
  title: 'Hello Mizzle!',
  content: 'My first post',
  authorId: user._id,
  createdAt: new Date(),
});

// Query with perfect type inference
const posts = await db().posts.findMany(
  {},
  {
    include: { author: true },
  }
);

// TypeScript knows exact types!
posts[0].title; // string
posts[0].author?.name; // string | undefined
posts[0].author?.email; // string | undefined
```

## Core Concepts

### Relations

Mizzle supports three relation strategies:

#### 1. EMBED Relations (Recommended)

Denormalize data for lightning-fast reads with optional auto-updates:

```typescript
import { embed } from '@mizzle-dev/orm';

const posts = mongoCollection('posts', {
  title: string(),
  authorId: objectId(),
}, {
  relations: {
    author: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email'],
      },
      keepFresh: true, // Auto-update when user changes
    }),
  },
});

// Author data embedded automatically!
const post = await db().posts.create({
  title: 'Hello World',
  authorId: userId,
});

console.log(post.author.name); // Direct access, no join needed
```

**Benefits:**
- Fast reads (no joins)
- Simple queries
- Optional auto-updates with `keepFresh`
- Perfect for read-heavy workloads

#### 2. LOOKUP Relations (Virtual Joins)

Query-time joins using MongoDB `$lookup`:

```typescript
import { lookup } from '@mizzle-dev/orm';

author: lookup(users, {
  localField: 'authorId',
  foreignField: '_id',
  one: true,
})
```

**Benefits:**
- Always fresh data
- Less storage
- Best for frequently-changing data

#### 3. REFERENCE Relations (Validation)

Validate referential integrity:

```typescript
import { reference } from '@mizzle-dev/orm';

author: reference(users, {
  localField: 'authorId',
  foreignField: '_id',
})
```

### Context & Multi-tenancy

Pass context for auth and multi-tenancy:

```typescript
// With context
const userPosts = await db({
  user: { id: userId, role: 'admin' },
  tenantId: 'acme-corp'
}).posts.findMany({});

// Without context
const allPosts = await db().posts.findMany({});
```

### Transactions

Built-in transaction support:

```typescript
await db.tx({}, async (txDb) => {
  const user = await txDb().users.create({ name: 'Bob' });
  const post = await txDb().posts.create({
    title: 'New Post',
    authorId: user._id
  });
  // Committed atomically
});
```

## Advanced Features

### Auto-updating Embeds

Keep embedded data fresh automatically:

```typescript
author: embed(users, {
  forward: {
    from: 'authorId',
    fields: ['name', 'avatar']
  },
  keepFresh: true, // Updates automatically when user changes
})
```

### Manual Refresh

Refresh embeds on-demand:

```typescript
// Query-time refresh (read-only)
const posts = await db().posts.findMany(
  { status: 'published' },
  { refreshEmbeds: ['author'] }
);

// Batch refresh (persisted)
await db().posts.refreshEmbeds('author', {
  filter: { updatedAt: { $lt: yesterday } },
  batchSize: 100,
});
```

### Nested Includes

Unlimited depth with perfect type inference:

```typescript
const posts = await db().posts.findMany({}, {
  include: {
    author: {
      include: {
        organization: true
      }
    },
    comments: {
      include: {
        user: true
      }
    }
  }
});

// All types perfectly inferred!
posts[0].author?.organization?.name // string | undefined
posts[0].comments[0]?.user?.email // string | undefined
```

## When to Use Each Relation Type

| Scenario | Best Choice | Why |
|----------|-------------|-----|
| Blog post authors | EMBED + `keepFresh` | Fast reads, occasional updates |
| E-commerce orders | EMBED (no auto-update) | Historical snapshot |
| Real-time stock prices | LOOKUP | Always need latest data |
| User permissions | LOOKUP | Changes frequently |
| Tag clouds | EMBED + `keepFresh` | Fast display, rare changes |

## Examples

Check out the [examples directory](./examples) for comprehensive demonstrations:

- [quickstart.ts](./examples/quickstart.ts) - 5-minute tutorial
- [blog-with-embeds.ts](./examples/blog-with-embeds.ts) - Blog platform with auto-updating embeds
- [ecommerce-orders.ts](./examples/ecommerce-orders.ts) - Order system with historical snapshots
- [mizzle-api-example.ts](./examples/mizzle-api-example.ts) - Advanced usage patterns

## Documentation

- [Complete Documentation](./docs/README.md) - Full API reference and guides
- [Embed Relations Guide](./docs/embeds-guide.md) - Deep dive into embed strategies
- [Migration Guide](./docs/lookup-to-embed-migration.md) - Converting from lookups to embeds
- [Performance at Scale](./docs/PERFORMANCE_AT_SCALE.md) - Guidelines for large schemas

## API Overview

### Collections

```typescript
// Create
const user = await db().users.create({ name: 'Alice' });
const users = await db().users.createMany([...]);

// Read
const user = await db().users.findOne({ email: 'alice@example.com' });
const users = await db().users.findMany({ active: true });
const users = await db().users.findMany({}, { include: { posts: true } });

// Update
await db().users.updateOne({ _id: userId }, { name: 'Alice Updated' });
await db().users.updateMany({ active: false }, { deleted: true });

// Delete
await db().users.deleteOne({ _id: userId });
await db().users.deleteMany({ deleted: true });

// Aggregations
const result = await db().users.aggregate([...]);

// Raw access
const collection = db().users.collection; // Native MongoDB collection
```

### Database Instance

```typescript
db.schema    // Collection definitions
db.client    // Raw MongoClient
db.tx        // Transaction helper
db.close()   // Cleanup connection
```

## TypeScript Support

Mizzle provides exceptional TypeScript support:

- Zero `any` types in your queries
- Perfect inference for nested includes
- Compile-time safety for all operations
- Full IntelliSense support
- Type-safe filters and projections

## Performance

**Read Performance:**
- EMBED: ~50-100ms for 1000 documents
- LOOKUP: ~200-500ms for 1000 documents

**Recommendation:** Use EMBED for read-heavy workloads, LOOKUP for write-heavy or when data changes frequently.

## Contributing

Contributions are welcome! Please check out our [GitHub repository](https://github.com/mizzle-dev/mizzle-orm).

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT © [Mizzle Dev](https://github.com/mizzle-dev)

## Links

- [Documentation](https://orm.mizzle.dev)
- [GitHub Repository](https://github.com/mizzle-dev/mizzle-orm)
- [Issue Tracker](https://github.com/mizzle-dev/mizzle-orm/issues)
- [NPM Package](https://www.npmjs.com/package/@mizzle-dev/orm)

---

**Built with love for the MongoDB + TypeScript community**
