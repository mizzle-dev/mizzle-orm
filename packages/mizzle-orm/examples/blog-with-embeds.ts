/**
 * Blog Application with EMBED Relations
 *
 * This example demonstrates a complete blog platform using embeds for:
 * - Author information in posts (auto-updating)
 * - Category details in posts (auto-updating)
 * - Post metadata in comments (historical snapshot)
 * - Tag information in posts (auto-updating)
 *
 * Run with: tsx examples/blog-with-embeds.ts
 */

import {
  mizzle,
  defineSchema,
  mongoCollection,
  embed,
  objectId,
  string,
  number,
  date,
  array,
  publicId,
} from '../src/index';

// =============================================================================
// Collections
// =============================================================================

/**
 * Users Collection
 * Core user profiles that can author posts
 */
const users = mongoCollection('users', {
  id: publicId('usr'),           // Public ID: usr_abc123
  name: string(),
  email: string().email(),
  avatar: string().url().optional(),
  bio: string().optional(),
  createdAt: date().defaultNow(),
});

/**
 * Categories Collection
 * Blog post categories/topics
 */
const categories = mongoCollection('categories', {
  _id: objectId().internalId(),
  slug: string(),
  title: string(),
  description: string().optional(),
  color: string().optional(),
});

/**
 * Tags Collection
 * Flexible tagging for posts
 */
const tags = mongoCollection('tags', {
  _id: objectId().internalId(),
  name: string(),
  color: string(),
});

/**
 * Posts Collection
 * Blog posts with embedded author, category, and tags
 */
const posts = mongoCollection(
  'posts',
  {
    _id: objectId().internalId(),
    title: string(),
    slug: string(),
    content: string(),
    excerpt: string().optional(),
    status: string(), // 'draft' | 'published' | 'archived'

    // References
    authorId: string(),      // References user.id (publicId)
    categoryId: objectId(),
    tagIds: array(objectId()).optional(),

    // Metadata
    viewCount: number().int().default(0),
    publishedAt: date().optional(),
    createdAt: date().defaultNow(),
    updatedAt: date().onUpdateNow(),
  },
  {
    relations: {
      // EMBED: Author info (auto-updates when user changes)
      author: embed(users, {
        forward: {
          from: 'authorId',
          projection: { name: 1, avatar: 1, bio: 1 },
          embedIdField: 'id', // Use publicId instead of _id
        },
        reverse: {
          enabled: true,
          strategy: 'async',              // Non-blocking updates
          watchFields: ['name', 'avatar'], // Only update on these changes
        },
      }),

      // EMBED: Category info (auto-updates)
      category: embed(categories, {
        forward: {
          from: 'categoryId',
          projection: { slug: 1, title: 1, color: 1 },
        },
        reverse: {
          enabled: true,
          watchFields: ['title', 'color'],
        },
      }),

      // EMBED: Tags (auto-updates)
      tags: embed(tags, {
        forward: {
          from: 'tagIds',
          projection: { name: 1, color: 1 },
        },
        reverse: {
          enabled: true,
          watchFields: ['name', 'color'],
        },
      }),
    },
  }
);

/**
 * Comments Collection
 * Post comments with embedded post metadata (historical snapshot)
 */
const comments = mongoCollection(
  'comments',
  {
    _id: objectId().internalId(),
    postId: objectId(),
    authorId: string(), // User publicId
    content: string(),
    createdAt: date().defaultNow(),
    updatedAt: date().onUpdateNow(),
  },
  {
    relations: {
      // EMBED: Post metadata (NO auto-update - historical snapshot)
      post: embed(posts, {
        forward: {
          from: 'postId',
          projection: { title: 1, slug: 1 },
        },
        // No reverse config - we want the snapshot at comment time
      }),

      // EMBED: Comment author (auto-updates)
      author: embed(users, {
        forward: {
          from: 'authorId',
          projection: { name: 1, avatar: 1 },
          embedIdField: 'id',
        },
        reverse: {
          enabled: true,
          watchFields: ['name', 'avatar'],
        },
      }),
    },
  }
);

// =============================================================================
// ORM Setup
// =============================================================================

const schema = defineSchema({
  users,
  categories,
  tags,
  posts,
  comments,
});

const db = await mizzle({
  uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  dbName: 'blog_embeds_example',
  schema,
});


// =============================================================================
// Example Usage
// =============================================================================

async function main() {
  console.log('🚀 Blog with Embeds Example\n');

  // ---------------------------------------------------------------------------
  // 1. Create base data
  // ---------------------------------------------------------------------------
  console.log('📝 Creating base data...');

  const alice = await db().users.create({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    avatar: 'https://i.pravatar.cc/150?img=1',
    bio: 'Tech writer and developer advocate',
  });

  const techCategory = await db().categories.create({
    slug: 'technology',
    title: 'Technology',
    description: 'Latest in tech',
    color: '#3B82F6',
  });

  const tag1 = await db().tags.create({
    name: 'TypeScript',
    color: '#007ACC',
  });

  const tag2 = await db().tags.create({
    name: 'MongoDB',
    color: '#4DB33D',
  });

  console.log(`✅ Created user: ${alice.name} (${alice.id})`);
  console.log(`✅ Created category: ${techCategory.title}`);
  console.log(`✅ Created tags: ${tag1.name}, ${tag2.name}\n`);

  // ---------------------------------------------------------------------------
  // 2. Create post with embeds
  // ---------------------------------------------------------------------------
  console.log('📰 Creating post (embeds added automatically)...');

  const post = await db().posts.create({
    title: 'Getting Started with Mizzle ORM',
    slug: 'getting-started-mizzle',
    content: 'Mizzle is a modern MongoDB ORM with amazing features...',
    excerpt: 'Learn how to use Mizzle ORM effectively',
    status: 'published',
    authorId: alice.id,
    categoryId: techCategory._id,
    tagIds: [tag1._id, tag2._id],
    publishedAt: new Date(),
  });

  console.log(`✅ Created post: "${post.title}"`);
  console.log(`   Author embed:`, post.author);
  console.log(`   Category embed:`, post.category);
  console.log(`   Tags embed:`, post.tags);
  console.log();

  // ---------------------------------------------------------------------------
  // 3. Add comment (with post snapshot)
  // ---------------------------------------------------------------------------
  console.log('💬 Adding comment...');

  const comment = await db().comments.create({
    postId: post._id,
    authorId: alice.id,
    content: 'Great article! Very helpful.',
  });

  console.log(`✅ Created comment`);
  console.log(`   Post embed:`, comment.post);
  console.log(`   Author embed:`, comment.author);
  console.log();

  // ---------------------------------------------------------------------------
  // 4. Test auto-updates (reverse embeds)
  // ---------------------------------------------------------------------------
  console.log('🔄 Testing auto-updates...');

  // Update user name
  await db().users.updateOne(
    { id: alice.id },
    { name: 'Alice J. Smith' }
  );

  console.log(`✅ Updated user name to "Alice J. Smith"`);

  // Query post - should have updated author name
  const updatedPost = await db().posts.findById(post._id);
  console.log(`   Post author name: ${updatedPost?.author?.name}`);

  // Query comment - should also have updated author name
  const updatedComment = await db().comments.findById(comment._id);
  console.log(`   Comment author name: ${updatedComment?.author?.name}`);
  console.log();

  // ---------------------------------------------------------------------------
  // 5. Test historical snapshot (no auto-update)
  // ---------------------------------------------------------------------------
  console.log('📸 Testing historical snapshot...');

  // Update post title
  await db().posts.updateById(post._id, {
    title: 'UPDATED: Getting Started with Mizzle ORM',
  });

  console.log(`✅ Updated post title`);

  // Query comment - should still have OLD post title (snapshot)
  const commentAfterPostUpdate = await db().comments.findById(comment._id);
  console.log(`   Comment's post title: "${commentAfterPostUpdate?.post?.title}"`);
  console.log(`   (Still shows original title - historical snapshot)`);
  console.log();

  // ---------------------------------------------------------------------------
  // 6. Test query-time refresh
  // ---------------------------------------------------------------------------
  console.log('🔍 Testing query-time refresh...');

  // Update category (bypassing ORM to simulate stale data)
  await db().categories.rawCollection().updateOne(
    { _id: techCategory._id },
    { $set: { title: 'Tech & Innovation', color: '#10B981' } }
  );

  console.log(`✅ Updated category title (bypassed auto-update)`);

  // Normal query - has stale data
  const postsWithStale = await db().posts.findMany({});
  console.log(`   Normal query - category: ${postsWithStale[0].category?.title}`);

  // Query with refresh - gets fresh data (not persisted)
  const postsWithFresh = await db().posts.findMany(
    {},
    { refreshEmbeds: ['category'] }
  );
  console.log(`   Refreshed query - category: ${postsWithFresh[0].category?.title}`);

  // Verify DB wasn't updated
  const postFromDb = await db().posts.findById(post._id);
  console.log(`   DB still has: ${postFromDb?.category?.title} (not persisted)`);
  console.log();

  // ---------------------------------------------------------------------------
  // 7. Test manual batch refresh
  // ---------------------------------------------------------------------------
  console.log('🔧 Testing manual batch refresh...');

  const stats = await db().posts.refreshEmbeds('category', {
    batchSize: 10,
    dryRun: false,
  });

  console.log(`✅ Batch refresh complete:`);
  console.log(`   Matched: ${stats.matched}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Errors: ${stats.errors}`);

  // Verify updates were persisted
  const postAfterRefresh = await db().posts.findById(post._id);
  console.log(`   Category now: ${postAfterRefresh?.category?.title}`);
  console.log();

  // ---------------------------------------------------------------------------
  // 8. Test array embeds
  // ---------------------------------------------------------------------------
  console.log('🏷️  Testing array embeds...');

  // Update tag
  await db().tags.updateById(tag1._id, {
    name: 'TypeScript 5.x',
    color: '#0074C1',
  });

  const postWithUpdatedTags = await db().posts.findById(post._id);
  console.log(`✅ Tag auto-updated:`);
  console.log(`   Tags:`, postWithUpdatedTags?.tags);
  console.log();

  // ---------------------------------------------------------------------------
  // 9. List all posts with embeds
  // ---------------------------------------------------------------------------
  console.log('📋 All posts:');

  const allPosts = await db().posts.findMany({ status: 'published' });

  for (const p of allPosts) {
    console.log(`\n  "${p.title}"`);
    console.log(`  Author: ${p.author?.name}`);
    console.log(`  Category: ${p.category?.title}`);
    console.log(`  Tags: ${p.tags?.map(t => t.name).join(', ') || 'None'}`);
    console.log(`  Views: ${p.viewCount}`);
  }
  console.log();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('✨ Summary:');
  console.log('  ✅ Forward embeds: Data automatically embedded on create');
  console.log('  ✅ Reverse embeds: Auto-updates when source changes');
  console.log('  ✅ Historical snapshots: Comments preserve post title');
  console.log('  ✅ Query-time refresh: Read fresh data without persisting');
  console.log('  ✅ Batch refresh: Manually update stale embeds');
  console.log('  ✅ Array embeds: Multiple tags embedded and auto-updated');
  console.log();
  console.log('🎉 Example complete!');
}

// Run example
main()
  .then(async () => {
    await db.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
