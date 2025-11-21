# Embed Relations

Embed relations provide **write-time denormalization** for optimal read performance in MongoDB. Instead of requiring `$lookup` operations at query time, referenced data is fetched and stored alongside the reference when documents are created or updated.

## Table of Contents

- [Why Use Embeds?](#why-use-embeds)
- [Basic Usage](#basic-usage)
- [Embed Strategies](#embed-strategies)
  - [Separate Strategy](#separate-strategy)
  - [Array Strategy](#array-strategy)
  - [In-Place Strategy](#in-place-strategy)
- [Custom ID Fields](#custom-id-fields)
- [Reverse Embeds (keepFresh)](#reverse-embeds-keepfresh)
- [Configuration Options](#configuration-options)
- [Type Safety](#type-safety)

---

## Why Use Embeds?

Embeds are ideal when:

✅ **Read performance is critical** - No `$lookup` needed at query time
✅ **Data is relatively stable** - Changes don't happen frequently
✅ **Denormalization is acceptable** - You're okay with data duplication
✅ **You want automatic sync** - keepFresh keeps embedded data updated

**Trade-offs:**
- ❌ Increases document size (more storage)
- ❌ Data duplication across documents
- ✅ Much faster reads (no joins)
- ✅ Can auto-update with `keepFresh`

---

## Basic Usage

### Simple Embed Example

```typescript
import { mongoCollection } from 'mizzle-orm';
import { string, objectId } from 'mizzle-orm/schema';
import { embed } from 'mizzle-orm/relations';

// Source collection
const users = mongoCollection('users', {
  _id: objectId().internalId(),
  name: string(),
  email: string(),
  avatar: string(),
});

// Collection with embedded data
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    content: string(),
    authorId: objectId(),
  },
  {
    relations: {
      author: embed(users, {
        forward: {
          from: 'authorId',              // ID field to lookup
          fields: ['name', 'email', 'avatar'], // Fields to embed
        },
      }),
    },
  },
);
```

### Creating Documents

```typescript
const orm = await createMongoOrm({ uri, dbName: 'myapp', collections: { users, posts } });
const ctx = orm.createContext({});
const db = orm.withContext(ctx);

// Create user
const user = await db.users.create({
  name: 'Alice',
  email: 'alice@example.com',
  avatar: 'https://example.com/alice.jpg',
});

// Create post - embedded data is automatically populated
const post = await db.posts.create({
  title: 'Hello World',
  content: 'My first post!',
  authorId: user._id,
});

console.log(post.author);
// {
//   _id: '507f1f77bcf86cd799439011',
//   name: 'Alice',
//   email: 'alice@example.com',
//   avatar: 'https://example.com/alice.jpg'
// }
```

**What happens:**
1. Post is created with `authorId`
2. ORM looks up the user by `_id`
3. Selected fields (`name`, `email`, `avatar`) are embedded
4. Embedded data is stored in `post.author`

### Stored Document

```json
{
  "_id": ObjectId("..."),
  "title": "Hello World",
  "content": "My first post!",
  "authorId": ObjectId("507f1f77bcf86cd799439011"),
  "author": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Alice",
    "email": "alice@example.com",
    "avatar": "https://example.com/alice.jpg"
  }
}
```

---

## Embed Strategies

### Separate Strategy

Stores embedded data in its own field (default behavior).

```typescript
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    authorId: objectId(), // Reference stored here
  },
  {
    relations: {
      author: embed(users, {
        forward: {
          from: 'authorId',              // Single ID
          fields: ['name', 'email'],
        },
      }),
    },
  },
);
```

**Result:**
```json
{
  "authorId": ObjectId("..."),
  "author": { "_id": "...", "name": "Alice", "email": "alice@example.com" }
}
```

---

### Array Strategy

Embeds multiple documents from an array of IDs.

```typescript
import { array } from 'mizzle-orm/schema';

const tags = mongoCollection('tags', {
  _id: objectId().internalId(),
  name: string(),
  color: string(),
});

const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    tagIds: array(objectId()), // Array of IDs
  },
  {
    relations: {
      tags: embed(tags, {
        forward: {
          from: 'tagIds',              // Array of IDs
          fields: ['name', 'color'],
        },
      }),
    },
  },
);
```

**Usage:**
```typescript
const post = await db.posts.create({
  title: 'Tech News',
  tagIds: [tag1._id, tag2._id, tag3._id],
});

console.log(post.tags);
// [
//   { _id: '...', name: 'Tech', color: 'blue' },
//   { _id: '...', name: 'News', color: 'red' },
//   { _id: '...', name: 'AI', color: 'green' }
// ]
```

**Result:**
```json
{
  "tagIds": [ObjectId("..."), ObjectId("..."), ObjectId("...")],
  "tags": [
    { "_id": "...", "name": "Tech", "color": "blue" },
    { "_id": "...", "name": "News", "color": "red" },
    { "_id": "...", "name": "AI", "color": "green" }
  ]
}
```

---

### In-Place Strategy

Merges embedded data into an existing object (no separate field).

```typescript
import { object } from 'mizzle-orm/schema';

const directories = mongoCollection('directories', {
  _id: objectId().internalId(),
  name: string(),
  type: string(),
});

const workflows = mongoCollection(
  'workflows',
  {
    _id: objectId().internalId(),
    name: string(),
    directory: object({
      _id: objectId(),
      name: string().optional(),
      type: string().optional(),
    }),
  },
  {
    relations: {
      directoryEmbed: embed(directories, {
        forward: {
          from: 'directory._id',      // Nested path with ._id
          fields: ['name', 'type'],
        },
      }),
    },
  },
);
```

**Usage:**
```typescript
const workflow = await db.workflows.create({
  name: 'Approval Process',
  directory: {
    _id: directory._id, // Only provide _id
  },
});

console.log(workflow.directory);
// {
//   _id: ObjectId("..."),
//   name: 'Legal',      // Auto-populated
//   type: 'Department'  // Auto-populated
// }
```

**Result:**
```json
{
  "name": "Approval Process",
  "directory": {
    "_id": ObjectId("..."),
    "name": "Legal",
    "type": "Department"
  }
}
```

**Detection:** In-place strategy is automatically used when `from` contains a dot (e.g., `'directory._id'`).

---

## Custom ID Fields

Use `embedIdField` to embed non-`_id` fields like public IDs.

### Example: Public ID Embeds

```typescript
import { publicId } from 'mizzle-orm/schema';

const users = mongoCollection('users', {
  id: publicId('usr'),  // Public ID like "usr_abc123"
  name: string(),
  email: string(),
});

const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    authorId: string(), // Store public ID as string
  },
  {
    relations: {
      author: embed(users, {
        forward: {
          from: 'authorId',
          fields: ['name', 'email'],
          embedIdField: 'id', // ← Use 'id' instead of '_id'
        },
      }),
    },
  },
);
```

**Usage:**
```typescript
const user = await db.users.create({
  name: 'Bob',
  email: 'bob@example.com',
});

console.log(user.id); // "usr_abc123"

const post = await db.posts.create({
  title: 'Hello',
  authorId: user.id, // ← Use public ID
});

console.log(post.author);
// {
//   _id: 'usr_abc123',  // ← Public ID, not ObjectId
//   name: 'Bob',
//   email: 'bob@example.com'
// }
```

**How it works:**
- ORM searches by `users.id` instead of `users._id`
- Embedded `_id` field contains the public ID string
- No ObjectId conversion needed

---

## Reverse Embeds (keepFresh)

Automatically update embedded data when source documents change.

### Basic keepFresh

```typescript
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    authorId: objectId(),
  },
  {
    relations: {
      author: embed(users, {
        forward: {
          from: 'authorId',
          fields: ['name', 'email', 'avatar'],
        },
        keepFresh: true, // ← Auto-update on source change
      }),
    },
  },
);
```

**What happens:**
```typescript
// Create post with embedded author
const post = await db.posts.create({
  title: 'My Post',
  authorId: user._id,
});

console.log(post.author.name); // "Alice"

// Update the author
await db.users.updateById(user._id, {
  name: 'Alice Smith',
  email: 'alice.smith@example.com',
});

// Fetch post again - embedded data is AUTOMATICALLY updated!
const updatedPost = await db.posts.findById(post._id);
console.log(updatedPost.author.name); // "Alice Smith" ✅
```

### watchFields - Selective Updates

Only propagate changes when specific fields are updated.

```typescript
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    authorId: objectId(),
  },
  {
    relations: {
      author: embed(users, {
        forward: {
          from: 'authorId',
          fields: ['name', 'email'],
        },
        reverse: {
          enabled: true,
          watchFields: ['name', 'email'], // ← Only update if these change
        },
      }),
    },
  },
);
```

**Behavior:**
```typescript
// Update avatar - NOT in watchFields
await db.users.updateById(user._id, {
  avatar: 'new-avatar.jpg',
});
// ❌ Embedded data NOT updated (avatar not watched)

// Update name - IS in watchFields
await db.users.updateById(user._id, {
  name: 'Alice Smith',
});
// ✅ Embedded data IS updated (name is watched)
```

### Reverse Embed Strategies

**All strategies supported:**

```typescript
// ✅ Separate strategy
keepFresh: true

// ✅ Array strategy - updates specific array elements
const posts = mongoCollection('posts', {
  tagIds: array(objectId()),
}, {
  relations: {
    tags: embed(tags, {
      forward: { from: 'tagIds', fields: ['name', 'color'] },
      keepFresh: true, // Updates matching array elements
    }),
  },
});

// ✅ In-place strategy - updates nested fields
const workflows = mongoCollection('workflows', {
  directory: object({ _id: objectId(), name: string().optional() }),
}, {
  relations: {
    directoryEmbed: embed(directories, {
      forward: { from: 'directory._id', fields: ['name', 'type'] },
      keepFresh: true, // Updates nested object fields
    }),
  },
});
```

---

## Configuration Options

### Forward Config

```typescript
forward: {
  from: string;                    // ID field path (e.g., 'authorId', 'tagIds', 'directory._id')
  fields: string[] | Record<string, 1 | 0>; // Fields to embed
  embedIdField?: string;           // ID field to use (default: '_id')
}
```

**Fields options:**

```typescript
// Array syntax - include specific fields
fields: ['name', 'email', 'avatar']

// Projection syntax - include (1) or exclude (0)
fields: { name: 1, email: 1, avatar: 1 }
fields: { password: 0, secretKey: 0 }  // Exclude sensitive fields
```

### Reverse Config

```typescript
// Option 1: Simple shorthand
keepFresh: true

// Option 2: Explicit config at top level
reverse: {
  enabled: true;
  watchFields?: string[];         // Only propagate if these fields change
  strategy?: 'sync' | 'async';    // Sync or background updates (future)
}

// Option 3: Inside forward config (deprecated)
forward: {
  from: 'authorId',
  fields: ['name', 'email'],
  reverse: {
    enabled: true,
    watchFields: ['name', 'email'],
  },
}
```

---

## Type Safety

Mizzle provides full type safety for embeds:

```typescript
const post = await db.posts.findById(postId);

// ✅ TypeScript knows author is embedded
post.author.name;      // string
post.author.email;     // string
post.author._id;       // string (always stringified)

// ✅ Array embeds
post.tags[0].name;     // string
post.tags.map(t => t.color); // string[]

// ✅ In-place embeds
workflow.directory.name; // string | undefined
workflow.directory.type; // string | undefined
```

**Type inference limitations:**

In test contexts, embedded fields may show as union types due to TypeScript's limitations with complex conditional types. Runtime behavior is always correct - this is a known TypeScript constraint.

```typescript
// In tests, you may need type guards:
if (Array.isArray(post.tags)) {
  // TypeScript now knows it's an array
  post.tags.forEach(tag => console.log(tag.name));
}
```

---

## Best Practices

### 1. Choose Fields Carefully

Only embed fields you actually need for display:

```typescript
// ❌ Don't embed everything
fields: ['name', 'email', 'bio', 'avatar', 'phone', 'address', 'preferences', ...]

// ✅ Embed only what's needed
fields: ['name', 'avatar'] // For display in lists
```

### 2. Use keepFresh Wisely

`keepFresh` adds update overhead - only use when data freshness is important:

```typescript
// ✅ Good use case: User profile data shown everywhere
keepFresh: true

// ❌ Bad use case: Historical snapshots that shouldn't change
keepFresh: false // Or omit
```

### 3. watchFields for Selective Sync

Reduce unnecessary updates by watching only relevant fields:

```typescript
// Only propagate changes that affect the UI
reverse: {
  enabled: true,
  watchFields: ['name', 'avatar'], // Don't care about email, bio, etc.
}
```

### 4. Security: Exclude Sensitive Fields

Never embed sensitive data:

```typescript
// ❌ NEVER DO THIS
fields: ['name', 'email', 'password', 'secretKey']

// ✅ Explicitly exclude
fields: { password: 0, secretKey: 0, apiKeys: 0 }

// ✅ Or only include safe fields
fields: ['name', 'avatar']
```

### 5. Consider Document Size

MongoDB documents have a 16MB limit:

```typescript
// ❌ Don't embed large data in arrays
tagIds: array(objectId()), // 100+ tags with full data

// ✅ Limit embedded fields for arrays
fields: ['name'] // Just the name, not full documents
```

---

## Performance Characteristics

### Write Performance

**Without keepFresh:**
- ✅ Fast - single lookup per embed on create/update
- ✅ No propagation overhead

**With keepFresh:**
- ⚠️ Slower - propagates to all documents with that embed
- ⚠️ Overhead proportional to # of documents with embed
- ✅ Can use `watchFields` to reduce updates

### Read Performance

- ✅ **Extremely fast** - no `$lookup` needed
- ✅ Data is already embedded in document
- ✅ No additional database round trips

### Storage

- ❌ **Increased storage** - data duplicated across documents
- ❌ Document size increases with each embed
- ⚠️ Monitor document sizes to stay under 16MB limit

---

## Examples

### E-commerce: Product Categories

```typescript
const categories = mongoCollection('categories', {
  _id: objectId().internalId(),
  name: string(),
  slug: string(),
});

const products = mongoCollection('products', {
  _id: objectId().internalId(),
  name: string(),
  price: number(),
  categoryId: objectId(),
}, {
  relations: {
    category: embed(categories, {
      forward: {
        from: 'categoryId',
        fields: ['name', 'slug'],
      },
      keepFresh: true, // Keep category names up to date
    }),
  },
});
```

### Blog: Tags with Colors

```typescript
const tags = mongoCollection('tags', {
  _id: objectId().internalId(),
  name: string(),
  color: string(),
  description: string(),
});

const articles = mongoCollection('articles', {
  _id: objectId().internalId(),
  title: string(),
  content: string(),
  tagIds: array(objectId()),
}, {
  relations: {
    tags: embed(tags, {
      forward: {
        from: 'tagIds',
        fields: ['name', 'color'], // Only name/color, not description
      },
      reverse: {
        enabled: true,
        watchFields: ['name', 'color'], // Only update these fields
      },
    }),
  },
});
```

### Workflow System: Directory References

```typescript
const directories = mongoCollection('directories', {
  _id: objectId().internalId(),
  name: string(),
  type: string(),
  parent: objectId().optional(),
});

const workflows = mongoCollection('workflows', {
  _id: objectId().internalId(),
  name: string(),
  directory: object({
    _id: objectId(),
    name: string().optional(),
    type: string().optional(),
  }),
}, {
  relations: {
    directoryInfo: embed(directories, {
      forward: {
        from: 'directory._id', // In-place merge
        fields: ['name', 'type'],
      },
      keepFresh: true,
    }),
  },
});
```

---

## Migration Guide

### From Lookup to Embed

If you're migrating from lookup relations:

**Before (Lookup):**
```typescript
const posts = mongoCollection('posts', {
  _id: objectId().internalId(),
  title: string(),
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

// Usage - requires include
const posts = await db.posts.findMany({}, {
  include: { author: true }, // ← Required for lookup
});
```

**After (Embed):**
```typescript
const posts = mongoCollection('posts', {
  _id: objectId().internalId(),
  title: string(),
  authorId: objectId(),
}, {
  relations: {
    author: embed(users, {
      forward: {
        from: 'authorId',
        fields: ['name', 'email', 'avatar'],
      },
      keepFresh: true,
    }),
  },
});

// Usage - no include needed!
const posts = await db.posts.findMany({});
// author data is always present
```

**Migration steps:**

1. Add embed relation (keeps lookup working)
2. Run migration to populate embedded data for existing documents
3. Update queries to remove `include`
4. Remove lookup relation once confident

---

## Troubleshooting

### Embedded data not appearing

```typescript
// ❌ Check: Is forward config correct?
forward: {
  from: 'authorId',  // Must match field name exactly
  fields: ['name', 'email'],
}

// ❌ Check: Does source document exist?
const user = await db.users.findById(authorId);
console.log(user); // null = document doesn't exist

// ❌ Check: Are fields included in source schema?
const users = mongoCollection('users', {
  name: string(),    // ✅ Included
  email: string(),   // ✅ Included
  // ❌ 'avatar' not in schema - can't be embedded
});
```

### keepFresh not updating

```typescript
// ❌ Check: Is keepFresh enabled?
keepFresh: true, // or reverse: { enabled: true }

// ❌ Check: Are you updating watched fields?
reverse: {
  enabled: true,
  watchFields: ['name', 'email'],
}
// Updating 'bio' won't trigger update (not in watchFields)

// ❌ Check: Is registry built correctly?
// Look for the collection in ORM initialization logs
```

### Type errors in tests

```typescript
// In tests, use type guards:
if (Array.isArray(post.tags)) {
  expect(post.tags[0].name).toBe('Tech');
}

if (!post.author || Array.isArray(post.author)) {
  throw new Error('Expected single embed');
}
expect(post.author.name).toBe('Alice');
```

---

## API Reference

### embed()

```typescript
function embed<TSource>(
  sourceCollection: CollectionDefinition<TSource>,
  config: EmbedConfig,
): EmbedRelation;
```

**Config:**
```typescript
interface EmbedConfig {
  forward: {
    from: string;
    fields: string[] | Record<string, 1 | 0>;
    embedIdField?: string;
  };
  keepFresh?: boolean;
  reverse?: {
    enabled: boolean;
    watchFields?: string[];
    strategy?: 'sync' | 'async';
  };
}
```

---

## What's Next?

- Learn about [Lookup Relations](./lookups.md) for read-time joins
- Explore [Reference Relations](./references.md) for foreign key validation
- See [Policies](./policies.md) for access control
- Check [Hooks](./hooks.md) for lifecycle events
