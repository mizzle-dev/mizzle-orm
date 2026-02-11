/**
 * Standard Schema Support with Zod - Example
 *
 * This example demonstrates how to use Zod schemas to define collections
 * instead of Mizzle's built-in field builders. This approach gives you:
 *
 * - Full Zod validation with transforms, refinements, and custom errors
 * - Automatic default extraction and application
 * - Compatibility with any Standard Schema library (Zod, Valibot, ArkType)
 * - Perfect TypeScript inference from your schemas
 */

import { z } from 'zod';
import { mizzle, defineSchema, fromZod, ZodValidationError } from '../src';

// ============================================================
// Step 1: Define your schemas with Zod
// ============================================================

// User schema with validation rules and defaults
const userSchema = z.object({
  email: z.string().email('Must be a valid email'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['user', 'admin', 'moderator']).default('user'),
  age: z.number().int().min(0).max(150).optional(),
  settings: z
    .object({
      theme: z.enum(['light', 'dark']).default('light'),
      notifications: z.boolean().default(true),
      locale: z.string().default('en-US'),
    })
    .default({}),
  bio: z.string().max(500).optional(),
});

// Post schema with transforms
const postSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .transform((s) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')),
  content: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  tags: z.array(z.string()).default([]),
  views: z.number().int().min(0).default(0),
  authorId: z.string(), // ObjectId as string for this example
});

// Comment schema - simple nested structure
const commentSchema = z.object({
  postId: z.string(),
  authorId: z.string(),
  content: z.string().min(1).max(1000),
  likes: z.number().int().min(0).default(0),
});

// ============================================================
// Step 2: Create collections using fromZod
// ============================================================

// fromZod provides Zod-specific features:
// - Automatic default extraction and application
// - Better error formatting with flatten() and format()
// - Access to the original Zod schema for advanced use
const users = fromZod('users', userSchema, {
  publicId: 'user', // Generates 'user_abc123' style IDs
  timestamps: true, // Adds createdAt/updatedAt
});

const posts = fromZod('posts', postSchema, {
  publicId: 'post',
  softDelete: true, // Soft delete with deletedAt field
  timestamps: true,
});

const comments = fromZod('comments', commentSchema, {
  timestamps: { createdAt: 'created', updatedAt: 'modified' }, // Custom field names
});

// ============================================================
// Step 3: Type inference works automatically
// ============================================================

// These types are inferred from your Zod schemas - no manual type definitions!
type UserDocument = typeof users.$inferDocument;
// { _id: ObjectId; email: string; name: string; role: 'user' | 'admin' | 'moderator'; ... }

type UserInsert = typeof users.$inferInsert;
// { email: string; name: string; role?: 'user' | 'admin' | 'moderator'; ... } (defaults optional)

type PostDocument = typeof posts.$inferDocument;
// { _id: ObjectId; title: string; slug: string; content: string; ... }

// Log types for documentation (these are compile-time only)
const _userExample: UserDocument = null as any;
const _insertExample: UserInsert = null as any;
const _postExample: PostDocument = null as any;

// ============================================================
// Step 4: Connect and use
// ============================================================

async function main() {
  const schema = defineSchema({ users, posts, comments });

  const db = await mizzle({
    uri: 'mongodb://localhost:27017',
    dbName: 'standard-schema-example',
    schema,
  });

  try {
    // ============================================================
    // Creating documents - defaults are applied automatically
    // ============================================================

    console.log('Creating user with defaults...');

    // Only required fields needed - defaults are applied
    const user = await db().users.create({
      email: 'alice@example.com',
      name: 'Alice',
    });

    console.log('Created user:', {
      id: user.id, // Public ID: 'user_abc123'
      email: user.email,
      name: user.name,
      role: user.role, // 'user' (default applied)
      settings: user.settings, // { theme: 'light', notifications: true, locale: 'en-US' }
      createdAt: user.createdAt, // Auto timestamp
    });

    // ============================================================
    // Validation in action
    // ============================================================

    console.log('\nTesting validation...');

    try {
      await db().users.create({
        email: 'invalid-email', // Bad email
        name: '', // Empty name
      });
    } catch (error) {
      if (error instanceof ZodValidationError) {
        console.log('Validation failed (expected):');
        console.log('  Flattened:', error.flatten());
        // { formErrors: [], fieldErrors: { email: ['Must be a valid email'], name: ['Name is required'] } }

        console.log('  Error fields:', error.errorFields);
        // ['email', 'name']

        console.log('  Email errors:', error.getFieldErrors('email'));
        // ['Must be a valid email']
      }
    }

    // ============================================================
    // Transforms work on insert
    // ============================================================

    console.log('\nCreating post with transforms...');

    const post = await db().posts.create({
      title: 'My First Post!',
      slug: 'My First Post!', // Will be transformed to 'my-first-post'
      content: 'This is the content of my first post.',
      authorId: user._id.toString(),
    });

    console.log('Created post:', {
      id: post.id, // Public ID: 'post_xyz789'
      title: post.title,
      slug: post.slug, // 'my-first-post' (transformed)
      status: post.status, // 'draft' (default)
      views: post.views, // 0 (default)
      tags: post.tags, // [] (default)
    });

    // ============================================================
    // Partial updates with validation
    // ============================================================

    console.log('\nUpdating post...');

    // Partial updates only validate the fields you're changing
    await db().posts.updateOne(
      { _id: post._id },
      {
        status: 'published',
        views: 42,
      }
    );

    const updatedPost = await db().posts.findOne({ _id: post._id });
    console.log('Updated post status:', updatedPost?.status); // 'published'
    console.log('Updated views:', updatedPost?.views); // 42

    // ============================================================
    // Soft delete in action
    // ============================================================

    console.log('\nTesting soft delete...');

    await db().posts.softDelete(post._id);

    // findMany excludes soft-deleted documents by default
    const visiblePosts = await db().posts.findMany({});
    console.log('Visible posts after soft delete:', visiblePosts.length); // 0

    // Restore the post
    await db().posts.restore(post._id);

    const restoredPosts = await db().posts.findMany({});
    console.log('Visible posts after restore:', restoredPosts.length); // 1

    // ============================================================
    // Custom timestamp field names
    // ============================================================

    console.log('\nCreating comment with custom timestamp fields...');

    const comment = await db().comments.create({
      postId: post._id.toString(),
      authorId: user._id.toString(),
      content: 'Great post!',
    });

    console.log('Comment timestamps:', {
      created: (comment as any).created, // Custom createdAt field name
      modified: (comment as any).modified, // Custom updatedAt field name
    });

    // ============================================================
    // Working with the Zod schema directly
    // ============================================================

    console.log('\nDirect Zod schema access...');

    // You can still use the Zod schema for other purposes
    const zodSchema = posts._meta.zodSchema;
    const defaults = posts._meta.defaults;

    console.log('Extracted defaults:', defaults);
    // { status: 'draft', tags: [], views: 0 }

    // Validate data outside of database operations
    const parseResult = zodSchema.safeParse({
      title: 'Test',
      slug: 'test',
      content: 'Content',
      authorId: '123',
    });

    if (parseResult.success) {
      console.log('Direct validation passed');
    }

    // ============================================================
    // Summary
    // ============================================================

    console.log('\n✅ Standard Schema example complete!');
    console.log('\nKey features demonstrated:');
    console.log('  - Zod schema validation with custom messages');
    console.log('  - Automatic default extraction and application');
    console.log('  - Transform support (slug normalization)');
    console.log('  - Public ID generation');
    console.log('  - Soft delete support');
    console.log('  - Custom timestamp field names');
    console.log('  - ZodValidationError with flatten() and format()');
    console.log('  - Perfect TypeScript inference from schemas');
  } finally {
    await db.close();
  }
}

main().catch(console.error);

/**
 * Migration Guide: Field Builders → Standard Schema
 *
 * Before (field builders):
 * ```typescript
 * import { mongoCollection, string, number } from '@mizzle-dev/orm';
 *
 * const users = mongoCollection('users', {
 *   email: string(),
 *   name: string(),
 *   age: number().optional(),
 * });
 * ```
 *
 * After (Zod):
 * ```typescript
 * import { z } from 'zod';
 * import { fromZod } from '@mizzle-dev/orm';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 *   age: z.number().optional(),
 * });
 *
 * const users = fromZod('users', userSchema);
 * ```
 *
 * Benefits of Standard Schema approach:
 * - More powerful validation (refinements, transforms, custom errors)
 * - Reuse schemas across your app (forms, API validation, etc.)
 * - Ecosystem compatibility (Zod is widely adopted)
 * - Runtime type checking with detailed errors
 *
 * When to stick with field builders:
 * - Simple schemas without complex validation
 * - When you want minimal dependencies
 * - Legacy codebases already using field builders
 *
 * Both approaches work in the same schema - mix and match as needed!
 */
