# Mizzle ORM Documentation

Welcome to the Mizzle ORM documentation! This guide will help you understand and use all the features of Mizzle.

**Warning:** API is not stable. The docs may not match 100% and everything is subject to change.

## 📚 Documentation Index

### Core Guides

- **[EMBED Relations Guide](./embeds-guide.md)** - Complete guide to using embed relations
  - When to use embeds vs lookups
  - Forward embeds (all strategies)
  - Reverse embeds (auto-updates)
  - Refresh API
  - Best practices & performance tuning

- **[Migration Guide: Lookup → Embed](./lookup-to-embed-migration.md)** - Step-by-step migration guide
  - When to migrate
  - Safe migration process
  - Rollback procedures
  - Performance comparisons

---

## 🚀 Quick Start

### Basic Embed Example

```typescript
import { createMongoOrm, mongoCollection, embed } from 'mizzle-orm';
import { string, objectId } from 'mizzle-orm/fields';

const users = mongoCollection('users', {
  _id: objectId().internalId(),
  name: string(),
  email: string(),
});

const posts = mongoCollection('posts', {
  _id: objectId().internalId(),
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

const orm = await createMongoOrm({
  uri: 'mongodb://localhost:27017',
  dbName: 'blog',
  collections: { users, posts },
});

const db = orm.withContext(orm.createContext({}));

// Create post - author data embedded automatically!
const post = await db.posts.create({
  title: 'Hello World',
  authorId: userId,
});

console.log(post.author.name); // Access embedded data directly
```

---

## 📖 Feature Overview

### Relations

Mizzle supports three types of relations:

#### 1. **EMBED Relations** ⚡ (Recommended for most use cases)

Denormalize related data directly into documents for fast reads.

```typescript
author: embed(users, {
  forward: { from: 'authorId', fields: ['name', 'email'] },
  keepFresh: true, // Auto-update when source changes
})
```

**Pros:**
- ⚡ Fast reads (no joins)
- 🎯 Simple queries (no include needed)
- 💾 Better caching
- 🔄 Optional auto-updates

**Use When:**
- Read performance is critical
- Related data doesn't change often (or use `keepFresh`)
- You want simpler code

#### 2. **LOOKUP Relations** (Virtual joins)

Query-time joins using MongoDB `$lookup`.

```typescript
author: lookup(users, {
  localField: 'authorId',
  foreignField: '_id',
  one: true,
})
```

**Pros:**
- ✅ Always fresh data
- 💰 Less storage (no duplication)
- 🔒 Strong consistency

**Use When:**
- You need guaranteed freshness
- Related data changes very frequently
- Storage/duplication is a concern

#### 3. **REFERENCE Relations** (Validation only)

Validate that referenced IDs exist.

```typescript
author: reference(users, {
  localField: 'authorId',
  foreignField: '_id',
})
```

**Use When:**
- You just need referential integrity
- You'll fetch related data separately

---

## 🎯 When to Use Each Relation Type

| Scenario | Best Choice | Why |
|----------|-------------|-----|
| Blog post authors | EMBED + `keepFresh` | Fast reads, occasional updates |
| E-commerce order items | EMBED (no auto-update) | Historical snapshot |
| Real-time stock prices | LOOKUP | Always need latest data |
| User permissions | LOOKUP | Changes frequently |
| Comment counts | LOOKUP | Aggregated data |
| Tag clouds | EMBED + `keepFresh` | Fast display, rare changes |

---

## 💡 Examples

Comprehensive examples are available in the [`examples/`](../examples/) directory:

### [Blog with Embeds](../examples/blog-with-embeds.ts)

Complete blog platform demonstrating:
- Author embeds (auto-updating)
- Category embeds (auto-updating)
- Tag arrays (auto-updating)
- Comment embeds (historical snapshots)
- Query-time refresh
- Batch refresh operations

**Run:**
```bash
tsx examples/blog-with-embeds.ts
```

### [E-Commerce Orders](../examples/ecommerce-orders.ts)

Order management system showing:
- Product snapshots (preserve purchase-time prices)
- Customer contact (auto-updates for email/phone)
- Historical name preservation
- Perfect audit trail

**Run:**
```bash
tsx examples/ecommerce-orders.ts
```

---

## 🔧 API Reference

### Embed Configuration

```typescript
embed(sourceCollection, {
  // Forward embed (required)
  forward: {
    from: 'fieldName',              // ID field or path
    fields: ['name', 'email'],      // Fields to embed
    embedIdField: '_id',            // ID field to embed (default: '_id')
    into: 'customFieldName',        // Custom embed field name
  },

  // Reverse embed (optional - auto-updates)
  reverse: {
    enabled: true,
    strategy: 'sync' | 'async',     // Update strategy
    watchFields: ['name'],          // Only update when these change
  },

  // Or use shorthand
  keepFresh: true,                  // = reverse: { enabled: true, strategy: 'sync' }

  // Delete handling (optional)
  onSourceDelete: 'nullify' | 'cascade' | 'no-action',
})
```

### Refresh API

```typescript
// Query-time refresh (read-only)
const posts = await db.posts.findMany(
  { status: 'published' },
  { refreshEmbeds: ['author', 'category'] }
);

// Manual batch refresh (persisted)
const stats = await db.posts.refreshEmbeds('author', {
  filter: { updatedAt: { $lt: yesterday } },
  batchSize: 100,
  dryRun: false,
});
// Returns: { matched, updated, errors, skipped }
```

---

## 🎨 Embed Strategies

Mizzle automatically chooses the best strategy:

### 1. Separate Strategy (Default)

```typescript
from: 'authorId'

// Result:
{
  authorId: ObjectId(...),
  author: { _id: "...", name: "Alice", email: "..." }
}
```

### 2. In-Place Strategy

```typescript
from: 'directory._id'  // ← Path ends with ._id

// Result:
{
  directory: {
    _id: ObjectId(...),
    name: "Legal",      // ← Merged
    type: "department"  // ← Merged
  }
}
```

### 3. Array Strategy

```typescript
from: 'tagIds'  // ← Array field

// Result:
{
  tagIds: [ObjectId(...), ObjectId(...)],
  tags: [
    { _id: "...", name: "Tech", color: "blue" },
    { _id: "...", name: "News", color: "red" }
  ]
}
```

---

## 📊 Performance Guidelines

### Read Performance

| Type | Speed | Notes |
|------|-------|-------|
| EMBED | ⚡⚡⚡ Fast | Single query, data co-located |
| LOOKUP | 🐌 Slower | Requires $lookup join |

**Benchmark** (1000 documents):
- EMBED: ~50-100ms
- LOOKUP: ~200-500ms

### Write Performance

| Type | Speed | Notes |
|------|-------|-------|
| EMBED | 🐌 Slower | Must fetch embed data |
| LOOKUP | ⚡ Fast | No extra work |

**Trade-off:** Slower writes for much faster reads → Good for read-heavy workloads!

### Storage

- EMBED: More storage (duplication)
- LOOKUP: Less storage (normalized)

**Recommendation:** Keep embeds under 100KB per document

---

## 🛠️ Best Practices

### 1. Choose Fields Wisely

Only embed what you need:

```typescript
// ✅ Good
fields: ['name', 'avatar']

// ❌ Bad - too much data
fields: ['name', 'email', 'bio', 'settings', 'preferences', 'history']
```

### 2. Use keepFresh for Mutable Data

```typescript
// ✅ User names change occasionally
author: embed(users, {
  forward: { from: 'authorId', fields: ['name'] },
  keepFresh: true,
})

// ✅ Historical snapshot - preserve purchase price
product: embed(products, {
  forward: { from: 'productId', fields: ['name', 'price'] },
  // No keepFresh - don't update!
})
```

### 3. Watch Only Necessary Fields

```typescript
reverse: {
  enabled: true,
  watchFields: ['name', 'avatar'], // Only these trigger updates
}
```

### 4. Schedule Refresh Jobs

```typescript
// Daily maintenance
cron.schedule('0 2 * * *', async () => {
  await db.posts.refreshEmbeds('author', { batchSize: 500 });
});
```

### 5. Use Async for High-Write Scenarios

```typescript
reverse: {
  enabled: true,
  strategy: 'async', // Don't block writes
}
```

---

## 🆘 Troubleshooting

### Stale Embeds

**Problem:** Embedded data is outdated

**Solutions:**
1. Enable `keepFresh: true` for auto-updates
2. Use query-time refresh: `{ refreshEmbeds: ['field'] }`
3. Run batch refresh: `db.collection.refreshEmbeds('field')`

### Slow Writes

**Problem:** Creates/updates are slow with embeds

**Solutions:**
1. Use `strategy: 'async'` for reverse embeds
2. Reduce embedded fields
3. Use batch operations for bulk inserts

### Large Documents

**Problem:** Documents approaching 16MB limit

**Solutions:**
1. Reduce embedded fields
2. Use LOOKUP for large related data
3. Split into multiple documents

---

## 📦 What's Next?

1. **Read the [Embeds Guide](./embeds-guide.md)** for comprehensive documentation
2. **Try the [Examples](../examples/)** to see embeds in action
3. **Check the [Migration Guide](./lookup-to-embed-migration.md)** if converting from lookups

---

## 🎯 Summary

**Use EMBED when:**
- ✅ Read performance is critical
- ✅ Data doesn't change often (or use `keepFresh`)
- ✅ You want simpler queries
- ✅ You need historical snapshots

**Use LOOKUP when:**
- ✅ You need always-fresh data
- ✅ Data changes very frequently
- ✅ Storage is a concern

**Best of both worlds:**
Use EMBED + `keepFresh: true` for fast reads with automatic updates! ⚡

---

**Questions?** Check out our [GitHub Discussions](https://github.com/mizzle-dev/mizzle-orm/discussions)
