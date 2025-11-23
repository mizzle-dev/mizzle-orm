# Mizzle ORM Examples

This directory contains comprehensive examples demonstrating the Mizzle ORM API.

## Quick Start

### [quickstart.ts](./quickstart.ts)
**5-minute tutorial** - Get started with Mizzle in minutes.

```typescript
const schema = defineSchema({ users, posts });
const db = await mizzle({ uri, dbName, schema });

// Query with perfect types
const posts = await db().posts.findMany({}, {
  include: { author: true }
});
```

**Covers:**
- Defining collections and schema
- Creating database connection
- CRUD operations
- Nested includes with type inference
- Using context for multi-tenancy
- Transactions

## Comprehensive Examples

### [mizzle-api-example.ts](./mizzle-api-example.ts)
**Complete feature showcase** - Advanced usage patterns for real-world applications.

**Covers:**
- Multi-collection schema with relations
- 3-level nested includes
- Perfect type inference at all depths
- Context management for auth/multi-tenancy
- Transactions
- Complex filtering and sorting
- Bulk operations
- MongoDB aggregations
- Raw collection access

## Running Examples

### Prerequisites
```bash
# Start MongoDB (Docker)
docker run -d -p 27017:27017 mongo:7

# Or use MongoDB Atlas/local installation
```

### Run an example
```bash
cd packages/mizzle-orm

# Quick start
npx tsx examples/quickstart.ts

# Comprehensive example
npx tsx examples/mizzle-api-example.ts

# API comparison
npx tsx examples/api-comparison.ts
```

## Key Features Demonstrated

### 1. Perfect Type Inference
```typescript
const posts = await db().posts.findMany({}, {
  include: {
    author: {
      include: { organization: true }
    }
  }
});

// TypeScript knows exact types!
const authorName: string | undefined = posts[0]?.author?.name; // ✅
const orgName: string | undefined = posts[0]?.author?.organization?.name; // ✅
```

### 2. Callable Context
```typescript
// Pass context inline - clean and intuitive
await db({ user, tenantId }).users.findMany({});

// No context needed
await db().users.findMany({});
```

### 3. Transactions
```typescript
await db.tx({}, async (txDb) => {
  const user = await txDb().users.create({ ... });
  const post = await txDb().posts.create({ authorId: user._id });
  // Committed atomically
});
```

### 4. Unified Database Instance
```typescript
db.schema     // Collection definitions
db.client     // Raw MongoClient
db.tx         // Transaction helper
db.close()    // Cleanup
db._orm       // Internal ORM (advanced)
```

## Type Safety Examples

All examples demonstrate **S+ tier type safety**:

✅ **No `any` types** - Relations are properly typed
✅ **Nested includes** - Unlimited depth with perfect inference
✅ **Compile-time safety** - Catch errors before runtime
✅ **IntelliSense support** - Full autocomplete in your IDE

## Additional Resources

- [Performance at Scale](../docs/PERFORMANCE_AT_SCALE.md) - Guidelines for large schemas (200+ collections)
- [Type Inference Guide](../PERFECT_TYPE_INFERENCE.md) - Deep dive into type system
- [Embed Relations](../docs/embeds.md) - Denormalization patterns

## Contributing

Found a bug or want to add an example?

1. Open an issue on GitHub
2. Submit a PR with your example
3. Make sure it includes TypeScript types and comments

## License

MIT
