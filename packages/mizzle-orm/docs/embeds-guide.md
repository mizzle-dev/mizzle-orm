# EMBED Relations - Complete Guide

## Table of Contents

- [Overview](#overview)
- [When to Use Embeds](#when-to-use-embeds)
- [Quick Start](#quick-start)
- [Forward Embeds](#forward-embeds)
- [Reverse Embeds](#reverse-embeds)
- [Refresh API](#refresh-api)
- [Delete Handling](#delete-handling)
- [Best Practices](#best-practices)
- [Performance Tuning](#performance-tuning)
- [Migration Guide](#migration-guide)

---

## Overview

**EMBED relations** denormalize referenced data directly into your documents for faster reads and simpler queries. Unlike LOOKUP relations (which use MongoDB $lookup at query-time), embeds store a snapshot of related data alongside the parent document.

### Key Benefits

✅ **Faster queries** - No joins needed, data is co-located
✅ **Simpler code** - Access nested data directly without includes
✅ **Better caching** - Single document contains everything
✅ **Offline-friendly** - Complete data in one document

### Trade-offs

⚠️ **Denormalization** - Data is duplicated
⚠️ **Stale data** - Embeds can become outdated if source changes
⚠️ **Storage cost** - Uses more disk space

**Solution:** Use `keepFresh` for auto-updates or the Refresh API for manual maintenance.

---

## When to Use Embeds

### ✅ **Perfect For**

**1. Read-Heavy, Write-Light Data**
```typescript
// User profiles embedded in posts (rarely change)
const posts = mongoCollection('posts', { /* ... */ }, {
  relations: {
    author: embed(users, {
      forward: { from: 'authorId', fields: ['name', 'avatar'] },
      keepFresh: true, // Auto-update when user changes
    }),
  },
});
```

**2. Presentation/Display Data**
```typescript
// Product details in order items (snapshot at purchase time)
const orderItems = mongoCollection('order_items', { /* ... */ }, {
  relations: {
    product: embed(products, {
      forward: { from: 'productId', fields: ['name', 'price', 'sku'] },
      // NO keepFresh - we want the historical snapshot
    }),
  },
});
```

**3. Workflow/Metadata**
```typescript
// Directory info embedded in workflows
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
        from: 'directory._id',
        fields: ['name', 'type'],
      },
      keepFresh: true,
    }),
  },
});
```

### ❌ **Avoid When**

- Embedded data changes frequently (use LOOKUP instead)
- You need strong consistency guarantees
- Embedded data is large (>100KB per embed)
- You're embedding deeply nested structures

---

## Quick Start

### Basic Forward Embed

```typescript
import { mongoCollection, embed } from '@mizzle-dev/orm';
import { string, objectId } from '@mizzle-dev/orm/fields';

// Source collection
const authors = mongoCollection('authors', {
  _id: objectId().internalId(),
  name: string(),
  email: string(),
  bio: string(),
});

// Target collection with embed
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    content: string(),
    authorId: objectId(), // Reference to author
  },
  {
    relations: {
      author: embed(authors, {
        forward: {
          from: 'authorId',           // Field containing the ID
          fields: ['name', 'email'],  // Fields to embed
        },
      }),
    },
  }
);

// Usage
const schema = defineSchema({ authors, posts });
const db = await mizzle({ uri, dbName: 'blog', schema });

// Create author
const author = await db().authors.create({
  name: 'Alice',
  email: 'alice@example.com',
  bio: 'Tech writer',
});

// Create post - embed happens automatically!
const post = await db().posts.create({
  title: 'Getting Started with Mizzle',
  content: 'Learn how to...',
  authorId: author._id,
});

// Access embedded data directly
console.log(post.author.name);    // 'Alice'
console.log(post.author.email);   // 'alice@example.com'
console.log(post.author.bio);     // undefined (not included in fields)
```

---

## Forward Embeds

Forward embeds fetch data from the **source** collection and embed it into the **target** document during write operations (create/update).

### Strategies

Mizzle automatically chooses the best strategy based on your configuration:

#### 1. **Separate Strategy** (Default)

Creates a new field with embedded data.

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email'],
      },
    }),
  },
});

// Result document:
// {
//   _id: ObjectId(...),
//   title: "Post Title",
//   authorId: ObjectId(...),
//   author: {              // ← New field
//     _id: "507f1...",     // Author ID as string
//     name: "Alice",
//     email: "alice@example.com"
//   }
// }
```

#### 2. **In-Place Strategy**

Merges embedded data into an existing nested object.

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
        from: 'directory._id',  // ← Path ends with ._id
        fields: ['name', 'type'],
      },
    }),
  },
});

// Result document:
// {
//   _id: ObjectId(...),
//   directory: {
//     _id: ObjectId(...),
//     name: "Legal",       // ← Merged in-place
//     type: "department"   // ← Merged in-place
//   }
// }
```

#### 3. **Array Embeds**

Embed multiple documents from an array of IDs.

```typescript
const posts = mongoCollection('posts', {
  tagIds: array(objectId()),
}, {
  relations: {
    tags: embed(tags, {
      forward: {
        from: 'tagIds',  // ← Array field
        fields: ['name', 'color'],
      },
    }),
  },
});

// Result document:
// {
//   _id: ObjectId(...),
//   tagIds: [ObjectId(...), ObjectId(...)],
//   tags: [                 // ← Array of embeds
//     { _id: "...", name: "Tech", color: "blue" },
//     { _id: "...", name: "News", color: "red" }
//   ]
// }
```

### Advanced: Custom ID Field

Use public IDs or custom ID fields instead of `_id`.

```typescript
const users = mongoCollection('users', {
  id: publicId('usr'),  // e.g., "usr_abc123"
  name: string(),
});

const posts = mongoCollection('posts', {
  authorId: string(),  // References user.id (not _id)
}, {
  relations: {
    author: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name'],
        embedIdField: 'id',  // ← Use 'id' instead of '_id'
      },
    }),
  },
});
```

### Advanced: Multiple Paths

Collect IDs from multiple nested locations.

```typescript
const workflows = mongoCollection('workflows', {
  required: array(object({ ref: object({ _id: objectId() }) })),
  optional: array(object({ ref: object({ _id: objectId() }) })),
}, {
  relations: {
    allRefs: embed(references, {
      forward: {
        paths: [
          'required[].ref._id',
          'optional[].ref._id',
        ],
        fields: ['title', 'url'],
      },
    }),
  },
});
```

---

## Reverse Embeds

Reverse embeds **automatically update** embedded data when the source document changes. This keeps your denormalized data fresh.

### Basic Auto-Update

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email'],
      },
      keepFresh: true,  // ✅ Enable auto-updates
    }),
  },
});

// When author updates, all posts with this author get updated automatically!
await db.authors.updateById(authorId, {
  name: 'Alice Smith',  // Changed name
  email: 'alice.smith@example.com',
});

// All posts now have the updated author name
const posts = await db.posts.findMany({ authorId });
// posts[0].author.name === 'Alice Smith' ✅
```

### Selective Updates with `watchFields`

Only trigger updates when specific fields change.

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email'],
      },
      reverse: {
        enabled: true,
        watchFields: ['name', 'email'],  // Only watch these
      },
    }),
  },
});

// Triggers update (name changed)
await db.authors.updateById(authorId, { name: 'New Name' });

// Does NOT trigger update (bio not watched)
await db.authors.updateById(authorId, { bio: 'New bio' });
```

### Async Propagation

Defer updates to avoid blocking the main operation (better for high-write scenarios).

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: {
        from: 'authorId',
        fields: ['name'],
      },
      reverse: {
        enabled: true,
        strategy: 'async',  // ← Non-blocking updates
      },
    }),
  },
});

// Update returns immediately, embed update happens in background
await db.authors.updateById(authorId, { name: 'Alice' });
// Returns fast, posts updated asynchronously
```

---

## Refresh API

Manually refresh stale embeds - useful for maintenance, migrations, or one-off queries.

### Query-Time Refresh (Read-Only)

Fetch fresh data during queries without persisting to the database.

```typescript
// Get posts with fresh author data (not saved)
const posts = await db.posts.findMany(
  { status: 'published' },
  { refreshEmbeds: ['author'] }
);

// posts have fresh author data, but DB wasn't updated
```

**Use Cases:**
- Admin dashboards requiring real-time data
- Critical reports where freshness matters
- One-off queries where you need latest info
- Data exports

### Manual Batch Refresh (Persisted)

Refresh and persist embed updates in bulk.

```typescript
const stats = await db.posts.refreshEmbeds('author', {
  filter: { updatedAt: { $lt: yesterday } },  // Optional filter
  batchSize: 100,                              // Process in batches
  dryRun: false,                               // Set true to preview
});

console.log(stats);
// {
//   matched: 150,   // Documents matched
//   updated: 145,   // Successfully updated
//   errors: 0,      // Errors
//   skipped: 5      // Source not found
// }
```

**Use Cases:**
- Background maintenance jobs
- Fixing stale data after bulk updates
- Data migrations
- Scheduled cron tasks
- Recovery from failed auto-updates

**Dry-Run Example:**
```typescript
// Preview what would be updated
const preview = await db.posts.refreshEmbeds('author', { dryRun: true });
console.log(`Would update ${preview.updated} posts`);

// Actually update
const result = await db.posts.refreshEmbeds('author', { dryRun: false });
```

---

## Delete Handling

Control what happens to embeds when the source document is deleted.

### No Action (Default)

Embeds remain unchanged (may become stale).

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: { from: 'authorId', fields: ['name'] },
      // No onSourceDelete specified
    }),
  },
});

await db.authors.deleteById(authorId);
// Posts still have author embed (now stale)
```

### Nullify

Set embed field to `null` when source is deleted.

```typescript
const posts = mongoCollection('posts', {
  authorId: objectId().optional(),
}, {
  relations: {
    author: embed(authors, {
      forward: { from: 'authorId', fields: ['name'] },
      onSourceDelete: 'nullify',  // ← Set to null
    }),
  },
});

await db.authors.deleteById(authorId);
// Posts now have author: null
```

### Cascade

Delete target documents when source is deleted.

```typescript
const comments = mongoCollection('comments', {
  postId: objectId(),
}, {
  relations: {
    post: embed(posts, {
      forward: { from: 'postId', fields: ['title'] },
      onSourceDelete: 'cascade',  // ← Delete comments too
    }),
  },
});

await db.posts.deleteById(postId);
// All comments for this post are also deleted
```

---

## Best Practices

### 1. Choose the Right Fields

Only embed what you need for display/queries.

```typescript
// ✅ Good - Only display fields
author: embed(authors, {
  forward: { from: 'authorId', fields: ['name', 'avatar'] },
})

// ❌ Bad - Too much data
author: embed(authors, {
  forward: { from: 'authorId', fields: ['name', 'email', 'bio', 'settings', 'preferences'] },
})
```

### 2. Use keepFresh for Mutable Data

```typescript
// ✅ Good - Auto-update when user changes name
author: embed(users, {
  forward: { from: 'authorId', fields: ['name', 'avatar'] },
  keepFresh: true,
})

// ✅ Also good - Historical snapshot, don't update
product: embed(products, {
  forward: { from: 'productId', fields: ['name', 'price'] },
  // No keepFresh - preserve purchase-time data
})
```

### 3. Limit Embed Size

Keep total embedded data under 100KB per document.

```typescript
// ✅ Good - Small, focused embeds
tags: embed(tags, {
  forward: { from: 'tagIds', fields: ['name', 'color'] },
})

// ❌ Bad - Embedding large content
content: embed(contentBlocks, {
  forward: { from: 'blockIds', fields: ['html', 'css', 'js'] },  // Too large!
})
```

### 4. Use Refresh API for Maintenance

Schedule periodic refresh jobs for critical data.

```typescript
// Daily cron job
async function refreshStaleEmbeds() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stats = await db.posts.refreshEmbeds('author', {
    filter: { updatedAt: { $lt: yesterday } },
    batchSize: 200,
  });

  console.log(`Refreshed ${stats.updated} posts`);
}
```

### 5. Consider Async Propagation for High-Write

```typescript
// High-traffic user updates
author: embed(users, {
  forward: { from: 'authorId', fields: ['name'] },
  reverse: {
    enabled: true,
    strategy: 'async',  // Don't block user updates
    watchFields: ['name', 'avatar'],
  },
})
```

---

## Performance Tuning

### Read Performance

**Embeds:** ⚡ Single query, data co-located
**Lookups:** 🐌 Requires $lookup join

```typescript
// With embeds - 1 query
const posts = await db.posts.findMany({});
// posts[0].author.name ✅ Already available

// With lookups - 1 query + join
const posts = await db.posts.findMany({}, { include: 'author' });
// Slower, but always fresh
```

### Write Performance

Embeds add overhead on writes (need to fetch and embed data).

**Optimization:** Use batch operations for bulk inserts.

```typescript
// ❌ Slow - Embeds fetched for each insert
for (const post of posts) {
  await db.posts.create(post);
}

// ✅ Fast - Use insertMany (embeds processed in batch)
await db.posts.rawCollection().insertMany(posts);
await db.posts.refreshEmbeds('author');  // Refresh after
```

### Storage Cost

Monitor document sizes if embedding frequently.

```typescript
// Check document size
const post = await db.posts.findById(postId);
const size = JSON.stringify(post).length;
console.log(`Document size: ${size} bytes`);

// MongoDB limit: 16MB per document
// Recommended: Keep under 1MB
```

---

## Migration Guide

### From Lookups to Embeds

**Before (Lookup):**
```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: lookup(authors, {
      localField: 'authorId',
      foreignField: '_id',
      one: true,
    }),
  },
});

// Always need include
const posts = await db.posts.findMany({}, { include: 'author' });
```

**After (Embed):**
```typescript
const posts = mongoCollection('posts', {
  authorId: objectId(),
}, {
  relations: {
    author: embed(authors, {
      forward: { from: 'authorId', fields: ['name', 'email'] },
      keepFresh: true,  // Auto-update when author changes
    }),
  },
});

// Data already embedded
const posts = await db.posts.findMany({});
```

**Migration Steps:**

1. Add embed relation alongside lookup
2. Run batch refresh to populate embeds
3. Test thoroughly
4. Remove lookup relation
5. Optionally drop redundant indexes

```typescript
// Step 2: Populate existing embeds
const stats = await db.posts.refreshEmbeds('author');
console.log(`Migrated ${stats.updated} posts`);
```

---

## Summary

**Use Embeds When:**
- Read performance is critical
- Data doesn't change often
- You need simpler queries
- You want historical snapshots

**Use Lookups When:**
- You need always-fresh data
- Source changes frequently
- Storage is a concern
- You need strong consistency

**Best of Both Worlds:**
Use embeds with `keepFresh: true` for fast reads with automatic updates!

---

**Next Steps:**
- Check out [examples/](../examples/) for real-world use cases
- Read the [API Reference](./api-reference.md)
