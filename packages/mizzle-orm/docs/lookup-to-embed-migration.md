# Migration Guide: LOOKUP to EMBED Relations

## Overview

This guide helps you migrate from LOOKUP relations (query-time joins) to EMBED relations (denormalized data) for better read performance.

**When to migrate:**
- ✅ Read performance is critical
- ✅ Related data doesn't change frequently (or use `keepFresh`)
- ✅ You want simpler queries without `include`
- ✅ You're willing to trade storage for speed

**When NOT to migrate:**
- ❌ You need guaranteed data freshness
- ❌ Related data changes very frequently
- ❌ Storage/duplication is a concern
- ❌ You have very large embedded documents (>100KB)

---

## Migration Process

### Step 1: Add Embed Relation (Alongside LOOKUP)

Start by adding the embed relation **without removing** the lookup. This allows gradual migration.

**Before (LOOKUP only):**
```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: lookup(users, {
      localField: 'authorId',
      foreignField: '_id',
      one: true,
    }),
  },
});
```

**After (Both LOOKUP and EMBED):**
```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    // Keep existing lookup for backwards compatibility
    author: lookup(users, {
      localField: 'authorId',
      foreignField: '_id',
      one: true,
    }),

    // Add new embed relation
    authorEmbed: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email', 'avatar'],
      },
      keepFresh: true, // Auto-update when user changes
    }),
  },
});
```

---

### Step 2: Populate Existing Documents

Use the Refresh API to populate embeds in all existing documents.

```typescript
import { mizzle, defineSchema } from 'mizzle-orm';

const schema = defineSchema({ users, posts });
const db = await mizzle({
  uri: process.env.MONGO_URI!,
  dbName: 'your-db',
  schema,
});

// Populate embeds for all existing posts
console.log('Migrating posts to use embeds...');

const stats = await db().posts.refreshEmbeds('authorEmbed', {
  batchSize: 500, // Adjust based on your data size
  dryRun: false,
});

console.log(`Migration complete:`);
console.log(`  Matched: ${stats.matched}`);
console.log(`  Updated: ${stats.updated}`);
console.log(`  Errors: ${stats.errors}`);
console.log(`  Skipped: ${stats.skipped} (missing source)`);

await db.close();
```

**Pro Tips:**
- Run with `dryRun: true` first to preview
- Monitor progress with batch size tuning
- Handle errors (missing sources, etc.)

---

### Step 3: Update Application Code

Gradually update your application to use the new embed field.

**Before:**
```typescript
// Required include for every query
const posts = await db.posts.findMany({}, {
  include: 'author',
});

// Access author
posts[0].author?.name;
```

**After:**
```typescript
// No include needed - data already embedded!
const posts = await db.posts.findMany({});

// Access embedded author
posts[0].authorEmbed?.name;
```

**Transitional Code (supports both):**
```typescript
const posts = await db.posts.findMany({});

for (const post of posts) {
  // Use embed if available, fallback to lookup
  const author = post.authorEmbed || post.author;
  console.log(author?.name);
}
```

---

### Step 4: Test Thoroughly

Before removing the lookup, verify embeds work correctly:

```typescript
import { test, expect } from 'vitest';

test('embeds contain correct data', async () => {
  const user = await db.users.create({
    name: 'Test User',
    email: 'test@example.com',
  });

  const post = await db.posts.create({
    title: 'Test Post',
    authorId: user._id,
  });

  // Verify embed was created
  expect(post.authorEmbed).toBeDefined();
  expect(post.authorEmbed?.name).toBe('Test User');
  expect(post.authorEmbed?.email).toBe('test@example.com');
});

test('embeds auto-update with keepFresh', async () => {
  const user = await db.users.create({
    name: 'Alice',
    email: 'alice@example.com',
  });

  const post = await db.posts.create({
    title: 'Post',
    authorId: user._id,
  });

  // Update user
  await db.users.updateById(user._id, {
    name: 'Alice Updated',
  });

  // Verify embed was updated
  const updatedPost = await db.posts.findById(post._id);
  expect(updatedPost?.authorEmbed?.name).toBe('Alice Updated');
});
```

---

### Step 5: Remove LOOKUP Relation

Once confident, remove the lookup relation and rename embed.

**Final Schema:**
```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    // Renamed from authorEmbed to author
    author: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email', 'avatar'],
      },
      keepFresh: true,
    }),
  },
});
```

**Update Code:**
```typescript
// Simple, no include needed
const posts = await db.posts.findMany({});
posts[0].author?.name; // Works!
```

---

### Step 6: Cleanup (Optional)

**Remove Redundant Indexes:**

If you had indexes for the lookup join, you may no longer need them.

```typescript
// Before: Index for lookup performance
db.posts.createIndex({ authorId: 1 });

// After: Still useful for queries, but not for joins
// Keep if you filter by authorId, otherwise remove
```

**Monitor Performance:**

Track query performance before/after migration:

```typescript
console.time('Query posts');
const posts = await db.posts.findMany({});
console.timeEnd('Query posts');
// Before (lookup): ~200ms
// After (embed): ~50ms ✨
```

---

## Common Migration Scenarios

### Scenario 1: Simple One-to-One

**Before:**
```typescript
const profiles = mongoCollection('profiles', {
  userId: objectId(),
}, {
  relations: {
    user: lookup(users, {
      localField: 'userId',
      foreignField: '_id',
      one: true,
    }),
  },
});
```

**After:**
```typescript
const profiles = mongoCollection('profiles', {
  userId: objectId(),
}, {
  relations: {
    user: embed(users, {
      forward: {
        from: 'userId',
        fields: ['name', 'email'],
      },
      keepFresh: true,
    }),
  },
});
```

---

### Scenario 2: One-to-Many with Arrays

**Before:**
```typescript
const posts = mongoCollection('posts', {
  tagIds: array(objectId()),
}, {
  relations: {
    tags: lookup(tags, {
      localField: 'tagIds',
      foreignField: '_id',
      one: false, // Returns array
    }),
  },
});

// Usage
const posts = await db.posts.findMany({}, { include: 'tags' });
```

**After:**
```typescript
const posts = mongoCollection('posts', {
  tagIds: array(objectId()),
}, {
  relations: {
    tags: embed(tags, {
      forward: {
        from: 'tagIds', // Array of IDs
        fields: ['name', 'color'],
      },
      keepFresh: true,
    }),
  },
});

// Usage - no include needed
const posts = await db.posts.findMany({});
```

---

### Scenario 3: Nested Object Paths

**Before:**
```typescript
const workflows = mongoCollection('workflows', {
  metadata: object({
    directoryId: objectId(),
  }),
}, {
  relations: {
    directory: lookup(directories, {
      localField: 'metadata.directoryId',
      foreignField: '_id',
      one: true,
    }),
  },
});
```

**After (In-Place Strategy):**
```typescript
const workflows = mongoCollection('workflows', {
  directory: object({
    _id: objectId(),
    name: string().optional(),
    type: string().optional(),
  }),
}, {
  relations: {
    directoryEmbed: embed(directories, {
      forward: {
        from: 'directory._id', // Path ends with ._id → in-place
        fields: ['name', 'type'],
      },
      keepFresh: true,
    }),
  },
});

// Result: Fields merged into existing object
// workflow.directory = { _id, name, type }
```

---

## Rollback Plan

If you need to rollback after migration:

### Option 1: Re-add LOOKUP Temporarily

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    // Re-add lookup
    author: lookup(users, {
      localField: 'authorId',
      foreignField: '_id',
      one: true,
    }),

    // Keep embed for already-embedded data
    authorEmbed: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email'],
      },
    }),
  },
});
```

### Option 2: Remove Embedded Fields

```typescript
// Remove embedded data from documents
await db.posts.rawCollection().updateMany(
  {},
  { $unset: { authorEmbed: '' } }
);
```

---

## Performance Comparison

### Read Performance

**LOOKUP (Before):**
```typescript
// Query requires $lookup join
const posts = await db.posts.findMany({}, { include: 'author' });
// ~200-500ms for 1000 documents
```

**EMBED (After):**
```typescript
// Direct document read, no joins
const posts = await db.posts.findMany({});
// ~50-100ms for 1000 documents ⚡ 4-5x faster!
```

### Write Performance

**LOOKUP (Before):**
```typescript
// Simple insert
await db.posts.create({ title: 'Post', authorId });
// ~5ms
```

**EMBED (After):**
```typescript
// Insert + fetch embed data
await db.posts.create({ title: 'Post', authorId });
// ~15-20ms (slightly slower due to embed fetch)
```

**Trade-off:** Slower writes, much faster reads. Good for read-heavy workloads!

---

## Monitoring & Maintenance

### Set Up Periodic Refresh Jobs

Even with `keepFresh: true`, run periodic refresh for safety:

```typescript
// Daily cron job
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {
  console.log('Running daily embed refresh...');

  const schema = defineSchema({ /* ... */ });
  const db = await mizzle({ uri, dbName, schema });

  const stats = await db().posts.refreshEmbeds('author', {
    batchSize: 1000,
  });

  console.log(`Refreshed ${stats.updated} posts`);
  await db.close();
});
```

### Monitor Embed Freshness

```typescript
// Check for stale embeds
const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days

const postsToRefresh = await db.posts.count({
  updatedAt: { $lt: staleThreshold },
});

if (postsToRefresh > 0) {
  console.warn(`Found ${postsToRefresh} posts with potentially stale embeds`);
}
```

---

## Summary Checklist

- [ ] **Step 1:** Add embed relation alongside lookup
- [ ] **Step 2:** Run batch refresh to populate existing documents
- [ ] **Step 3:** Update application code to use embeds
- [ ] **Step 4:** Test thoroughly (correctness + auto-updates)
- [ ] **Step 5:** Remove lookup relation
- [ ] **Step 6:** Cleanup indexes and monitor performance
- [ ] **Ongoing:** Set up periodic refresh jobs

---

## Getting Help

**Issues during migration?**
- Check the [Embeds Guide](./embeds-guide.md)
- Review [examples/](../examples/)
- Open an issue on [GitHub](https://github.com/mizzle-dev/mizzle-orm)

**Need to keep both?**

You can keep both LOOKUP and EMBED relations if needed:
- Use LOOKUP when you need 100% fresh data
- Use EMBED for fast, cached reads
- Your choice per query!
