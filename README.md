# Mizzle ORM

> MongoDB ORM with Drizzle-inspired DX and Convex-like ergonomics

[![npm version](https://img.shields.io/npm/v/mizzle-orm.svg)](https://www.npmjs.com/package/mizzle-orm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Mizzle brings modern TypeScript DX to MongoDB with a clean, type-safe API inspired by Drizzle ORM, Convex and oRPC.

## Features

- 🔷 **Full TypeScript Support** - End-to-end type safety with schema inference
- 🎯 **Drizzle-Style DX** - Clean, intuitive API without unnecessary abstractions
- 🔐 **Row-Level Security** - Built-in policies for multi-tenant applications
- 🪝 **Lifecycle Hooks** - Before/after hooks for all operations
- 🆔 **Dual ID Support** - Internal ObjectId + public prefixed IDs
- 🗑️ **Soft Deletes** - Built-in soft delete and restore functionality
- ⚡ **Zero Config** - Works out of the box with sensible defaults
- 🔍 **Type-Safe Queries** - Full IntelliSense support for queries and mutations

## Quick Start

```bash
npm install mizzle-orm mongodb
# or
pnpm add mizzle-orm mongodb
```

```typescript
import { createMongoOrm, mongoCollection, objectId, publicId, string, date } from 'mizzle-orm';

// Define your schema
const users = mongoCollection(
  'users',
  {
    _id: objectId().internalId(),
    id: publicId('user'),
    email: string().email().unique(),
    displayName: string(),
    role: string().enum(['user', 'admin']).default('user'),
    createdAt: date().defaultNow(),
    updatedAt: date().defaultNow().onUpdateNow(),
  },
  {
    policies: {
      readFilter: (ctx) => ({ orgId: ctx.tenantId }),
    },
  },
);

// Create ORM instance
const orm = await createMongoOrm({
  uri: process.env.MONGO_URI!,
  dbName: 'myapp',
  collections: [users],
});

// Use with context!
const ctx = orm.createContext({ user, tenantId });
const db = orm.withContext(ctx);

// Create
const alice = await db.users.create({
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  role: 'user',
});
console.log(alice.id); // 'user_V1StGXR8_Z5jdHi6B-myT'

// Read
const user = await db.users.findById(alice.id); // Works with public ID
const byEmail = await db.users.findOne({ email: 'alice@example.com' });
const allUsers = await db.users.findMany({ role: 'user' }, { limit: 10 });

// Update
await db.users.updateById(alice.id, {
  displayName: 'Alice M. Smith',
});

// Soft delete
await db.users.softDelete(alice.id);
await db.users.restore(alice.id);

// Delete
await db.users.deleteById(alice.id);
```

## Features

### Type-Safe Schema Definition

```typescript
import { objectId, publicId, string, date, array } from 'mizzle-orm';

const users = mongoCollection('users', {
  _id: objectId().internalId(),
  id: publicId('user'), // Auto-generated: user_V1StGXR8_Z5jdHi6B-myT
  email: string().email().unique().index(),
  displayName: string().min(1).max(100),
  role: string().enum(['user', 'admin']).default('user'),
  tags: array(string()).optional(),
  createdAt: date().defaultNow(), // Auto-set on insert
  updatedAt: date().defaultNow().onUpdateNow(), // Auto-update
  deletedAt: date().nullable().softDeleteFlag(),
});

// Inferred types
type User = InferDocument<typeof users>;
type NewUser = InferInsert<typeof users>; // Only required fields!
type UpdateUser = InferUpdate<typeof users>; // All fields optional
```

### Row-Level Security

```typescript
const users = mongoCollection(
  'users',
  {
    // ... schema
  },
  {
    policies: {
      // Automatically applied to all queries
      readFilter: (ctx) => ({
        orgId: ctx.tenantIdObjectId,
        deletedAt: null,
      }),
      writeFilter: (ctx) => ({
        orgId: ctx.tenantIdObjectId,
      }),
      // Guard functions for fine-grained control
      canUpdate: (ctx, oldDoc, newDoc) => {
        return ctx.user?.roles?.includes('admin') || oldDoc.id === ctx.user?.id;
      },
      canDelete: (ctx) => ctx.user?.roles?.includes('admin'),
    },
  },
);
```

### Hooks

```typescript
const users = mongoCollection(
  'users',
  {
    // ... schema
  },
  {
    hooks: {
      beforeInsert: async (ctx, doc) => {
        console.log('Creating user:', doc.email);
        return doc;
      },
      afterInsert: async (ctx, doc) => {
        await sendWelcomeEmail(doc.email);
      },
      afterUpdate: async (ctx, oldDoc, newDoc) => {
        if (oldDoc.email !== newDoc.email) {
          await sendEmailChangeNotification(newDoc);
        }
      },
    },
  },
);
```

## Packages

This repository is a monorepo containing:

- [`mizzle-orm`](./packages/mizzle-orm) - Core MongoDB ORM package

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT © [Mizzle Dev](https://github.com/mizzle-dev)

## Credits

Inspired by:

- [Drizzle ORM](https://orm.drizzle.team/)
- [Convex](https://www.convex.dev/)
- [oRPC](https://orpc.unnoq.com/)
