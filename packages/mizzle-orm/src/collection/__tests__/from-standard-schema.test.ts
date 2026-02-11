/**
 * Tests for fromStandardSchema collection factory
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import type { ObjectId } from 'mongodb';
import {
  fromStandardSchema,
  isSSCollectionDefinition,
  type SSCollectionDefinition,
  type ExtractSSDocument,
  type ExtractSSInsert,
  type ExtractSSUpdate,
} from '../from-standard-schema';

describe('fromStandardSchema', () => {
  describe('basic functionality', () => {
    it('should create a collection definition from a Zod schema', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema);

      expect(users._brand).toBe('SSCollectionDefinition');
      expect(users._meta.name).toBe('users');
      expect(users._schema).toBe(userSchema);
    });

    it('should accept any StandardSchemaV1 compliant schema', () => {
      // Zod schemas implement Standard Schema
      const stringSchema = z.string();
      const numberSchema = z.number();
      const objectSchema = z.object({ foo: z.string() });
      const arraySchema = z.array(z.number());

      // All should work
      const col1 = fromStandardSchema('strings', stringSchema);
      const col2 = fromStandardSchema('numbers', numberSchema);
      const col3 = fromStandardSchema('objects', objectSchema);
      const col4 = fromStandardSchema('arrays', arraySchema);

      expect(col1._brand).toBe('SSCollectionDefinition');
      expect(col2._brand).toBe('SSCollectionDefinition');
      expect(col3._brand).toBe('SSCollectionDefinition');
      expect(col4._brand).toBe('SSCollectionDefinition');
    });

    it('should throw error for non-Standard Schema values', () => {
      const notASchema = { foo: 'bar' };

      expect(() => {
        fromStandardSchema('invalid', notASchema as any);
      }).toThrow('Standard Schema compliant');
    });

    it('should store the schema in the definition for runtime access', () => {
      const schema = z.object({
        title: z.string(),
        published: z.boolean(),
      });

      const posts = fromStandardSchema('posts', schema);

      // Schema should be accessible at runtime
      expect(posts._schema).toBe(schema);

      // Should be able to use it for validation
      const ssInterface = (posts._schema as any)['~standard'];
      expect(ssInterface).toBeDefined();
      expect(typeof ssInterface.validate).toBe('function');
    });
  });

  describe('options handling', () => {
    it('should accept options with publicId', () => {
      const schema = z.object({ name: z.string() });

      const users = fromStandardSchema('users', schema, {
        publicId: 'user',
      });

      expect(users._meta.options.publicId).toBe('user');
    });

    it('should accept options with softDelete', () => {
      const schema = z.object({ name: z.string() });

      const users = fromStandardSchema('users', schema, {
        softDelete: true,
      });

      expect(users._meta.options.softDelete).toBe(true);
    });

    it('should accept options with timestamps', () => {
      const schema = z.object({ name: z.string() });

      const users = fromStandardSchema('users', schema, {
        timestamps: true,
      });

      expect(users._meta.options.timestamps).toBe(true);
    });

    it('should accept all options together', () => {
      const schema = z.object({ name: z.string() });

      const users = fromStandardSchema('users', schema, {
        publicId: 'user',
        softDelete: true,
        timestamps: true,
      });

      expect(users._meta.options.publicId).toBe('user');
      expect(users._meta.options.softDelete).toBe(true);
      expect(users._meta.options.timestamps).toBe(true);
    });

    it('should work without options', () => {
      const schema = z.object({ name: z.string() });

      const users = fromStandardSchema('users', schema);

      expect(users._meta.options).toEqual({});
    });
  });

  describe('type inference - $inferDocument', () => {
    it('should infer Document type with _id: ObjectId added', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema);

      type UserDoc = typeof users.$inferDocument;

      // Verify type structure with expectTypeOf
      expectTypeOf<UserDoc>().toHaveProperty('_id');
      expectTypeOf<UserDoc>().toHaveProperty('email');
      expectTypeOf<UserDoc>().toHaveProperty('name');
      expectTypeOf<UserDoc['email']>().toBeString();
      expectTypeOf<UserDoc['name']>().toBeString();
    });

    it('should preserve custom _id type if defined in schema', () => {
      const customIdSchema = z.object({
        _id: z.string(),
        name: z.string(),
      });

      const items = fromStandardSchema('items', customIdSchema);

      type ItemDoc = typeof items.$inferDocument;

      // _id should be string, not ObjectId
      expectTypeOf<ItemDoc['_id']>().toBeString();
      expectTypeOf<ItemDoc['name']>().toBeString();
    });

    it('should handle nested objects in Document type', () => {
      const schema = z.object({
        profile: z.object({
          bio: z.string(),
          avatar: z.string().url(),
        }),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
          notifications: z.boolean(),
        }),
      });

      const users = fromStandardSchema('users', schema);

      type UserDoc = typeof users.$inferDocument;

      expectTypeOf<UserDoc['profile']>().toHaveProperty('bio');
      expectTypeOf<UserDoc['profile']['bio']>().toBeString();
      expectTypeOf<UserDoc['settings']['theme']>().toEqualTypeOf<'light' | 'dark'>();
    });

    it('should handle transforms in Document type', () => {
      const schema = z.object({
        slug: z.string().transform((s) => s.toLowerCase()),
        count: z.string().transform((s) => parseInt(s, 10)),
      });

      const posts = fromStandardSchema('posts', schema);

      type PostDoc = typeof posts.$inferDocument;

      // Output types after transform
      expectTypeOf<PostDoc['slug']>().toBeString();
      expectTypeOf<PostDoc['count']>().toBeNumber();
    });
  });

  describe('type inference - $inferInsert', () => {
    it('should infer Insert type as schema input type', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema);

      type UserInsert = typeof users.$inferInsert;

      expectTypeOf<UserInsert>().toHaveProperty('email');
      expectTypeOf<UserInsert>().toHaveProperty('name');
      expectTypeOf<UserInsert['email']>().toBeString();
    });

    it('should handle optional fields in Insert type', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const items = fromStandardSchema('items', schema);

      type ItemInsert = typeof items.$inferInsert;

      // Required field is required
      expectTypeOf<ItemInsert['required']>().toBeString();
      // Optional field allows undefined
      expectTypeOf<ItemInsert['optional']>().toEqualTypeOf<string | undefined>();
    });

    it('should handle defaults making fields optional in Insert type', () => {
      const schema = z.object({
        name: z.string(),
        role: z.enum(['user', 'admin']).default('user'),
      });

      const users = fromStandardSchema('users', schema);

      type UserInsert = typeof users.$inferInsert;

      // name is required
      expectTypeOf<UserInsert['name']>().toBeString();
      // role is optional due to default (Zod makes it optional in input type)
      expectTypeOf<UserInsert>().toHaveProperty('role');
    });

    it('should use input type (before transforms)', () => {
      const schema = z.object({
        slug: z.string().transform((s) => s.toLowerCase()),
        count: z.string().transform((s) => parseInt(s, 10)),
      });

      const posts = fromStandardSchema('posts', schema);

      type PostInsert = typeof posts.$inferInsert;

      // Input types before transform
      expectTypeOf<PostInsert['slug']>().toBeString();
      expectTypeOf<PostInsert['count']>().toBeString(); // Still string on input
    });
  });

  describe('type inference - $inferUpdate', () => {
    it('should infer Update type as Partial without _id', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', userSchema);

      type UserUpdate = typeof users.$inferUpdate;

      // All fields should be optional
      expectTypeOf<UserUpdate>().toMatchTypeOf<{
        email?: string;
        name?: string;
      }>();
    });

    it('should exclude _id from Update type', () => {
      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });

      const items = fromStandardSchema('items', schema);

      type ItemUpdate = typeof items.$inferUpdate;

      // Should not have _id
      expectTypeOf<ItemUpdate>().not.toHaveProperty('_id');
      // Should have other fields as optional
      expectTypeOf<ItemUpdate>().toMatchTypeOf<{
        name?: string;
        value?: number;
      }>();
    });

    it('should use output type (after transforms) for Update', () => {
      const schema = z.object({
        count: z.string().transform((s) => parseInt(s, 10)),
      });

      const items = fromStandardSchema('items', schema);

      type ItemUpdate = typeof items.$inferUpdate;

      // Uses output type (number after transform)
      expectTypeOf<ItemUpdate>().toMatchTypeOf<{
        count?: number;
      }>();
    });
  });

  describe('Extract type helpers', () => {
    it('should extract Document type with ExtractSSDocument', () => {
      const schema = z.object({
        email: z.string(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', schema);

      type UserDoc = ExtractSSDocument<typeof users>;

      expectTypeOf<UserDoc>().toHaveProperty('_id');
      expectTypeOf<UserDoc>().toHaveProperty('email');
      expectTypeOf<UserDoc>().toHaveProperty('name');
    });

    it('should extract Insert type with ExtractSSInsert', () => {
      const schema = z.object({
        email: z.string(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', schema);

      type UserInsert = ExtractSSInsert<typeof users>;

      expectTypeOf<UserInsert>().toHaveProperty('email');
      expectTypeOf<UserInsert>().toHaveProperty('name');
    });

    it('should extract Update type with ExtractSSUpdate', () => {
      const schema = z.object({
        email: z.string(),
        name: z.string(),
      });

      const users = fromStandardSchema('users', schema);

      type UserUpdate = ExtractSSUpdate<typeof users>;

      expectTypeOf<UserUpdate>().toMatchTypeOf<{
        email?: string;
        name?: string;
      }>();
    });
  });

  describe('isSSCollectionDefinition type guard', () => {
    it('should return true for SSCollectionDefinition', () => {
      const schema = z.object({ name: z.string() });
      const users = fromStandardSchema('users', schema);

      expect(isSSCollectionDefinition(users)).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(isSSCollectionDefinition(null)).toBe(false);
      expect(isSSCollectionDefinition(undefined)).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isSSCollectionDefinition({})).toBe(false);
      expect(isSSCollectionDefinition({ _brand: 'wrong' })).toBe(false);
    });

    it('should return false for objects with wrong brand', () => {
      expect(isSSCollectionDefinition({ _brand: 'CollectionDefinition' })).toBe(false);
    });
  });

  describe('realistic usage examples', () => {
    it('should work with a typical user collection', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
        role: z.enum(['user', 'admin', 'moderator']).default('user'),
        profile: z
          .object({
            bio: z.string().optional(),
            website: z.string().url().optional(),
          })
          .optional(),
        lastLoginAt: z.date().optional(),
        createdAt: z.date().default(() => new Date()),
      });

      const users = fromStandardSchema('users', userSchema, {
        publicId: 'user',
        softDelete: true,
        timestamps: true,
      });

      expect(users._meta.name).toBe('users');
      expect(users._meta.options.publicId).toBe('user');

      // Type checks
      type UserDoc = typeof users.$inferDocument;
      type UserInsert = typeof users.$inferInsert;

      expectTypeOf<UserDoc>().toHaveProperty('_id');
      expectTypeOf<UserDoc['role']>().toEqualTypeOf<'user' | 'admin' | 'moderator'>();

      expectTypeOf<UserInsert['email']>().toBeString();
    });

    it('should work with a blog post collection with transforms', () => {
      const postSchema = z.object({
        title: z.string().min(1).max(200),
        slug: z.string().transform((s) =>
          s
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
        ),
        content: z.string(),
        tags: z.array(z.string()).default([]),
        published: z.boolean().default(false),
        views: z.number().int().min(0).default(0),
        authorId: z.string(),
      });

      const posts = fromStandardSchema('posts', postSchema, {
        publicId: 'post',
      });

      expect(posts._meta.name).toBe('posts');

      type PostDoc = typeof posts.$inferDocument;
      type PostInsert = typeof posts.$inferInsert;

      // Document has transformed types
      expectTypeOf<PostDoc['slug']>().toBeString();
      expectTypeOf<PostDoc['views']>().toBeNumber();
      expectTypeOf<PostDoc['tags']>().toEqualTypeOf<string[]>();

      // Insert accepts input types
      expectTypeOf<PostInsert['slug']>().toBeString();
    });

    it('should allow runtime validation using stored schema', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0).max(150),
      });

      const users = fromStandardSchema('users', schema);

      // Access the Standard Schema interface for validation
      const ssInterface = (users._schema as any)['~standard'];

      // Valid data
      const validResult = ssInterface.validate({ email: 'test@example.com', age: 25 });
      const resolved = validResult instanceof Promise ? await validResult : validResult;
      expect(resolved.issues).toBeUndefined();
      expect(resolved.value).toEqual({ email: 'test@example.com', age: 25 });

      // Invalid data
      const invalidResult = ssInterface.validate({ email: 'not-an-email', age: -5 });
      const resolvedInvalid = invalidResult instanceof Promise ? await invalidResult : invalidResult;
      expect(resolvedInvalid.issues).toBeDefined();
      expect(resolvedInvalid.issues!.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty object schema', () => {
      const schema = z.object({});
      const empty = fromStandardSchema('empty', schema);

      expect(empty._meta.name).toBe('empty');

      type EmptyDoc = typeof empty.$inferDocument;
      expectTypeOf<EmptyDoc>().toHaveProperty('_id');
    });

    it('should handle deeply nested schemas', () => {
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              value: z.string(),
            }),
          }),
        }),
      });

      const deep = fromStandardSchema('deep', schema);

      type DeepDoc = typeof deep.$inferDocument;

      expectTypeOf<DeepDoc['level1']['level2']['level3']['value']>().toBeString();
    });

    it('should handle union types', () => {
      const schema = z.object({
        status: z.union([
          z.literal('pending'),
          z.literal('approved'),
          z.literal('rejected'),
        ]),
      });

      const items = fromStandardSchema('items', schema);

      type ItemDoc = typeof items.$inferDocument;

      expectTypeOf<ItemDoc['status']>().toEqualTypeOf<'pending' | 'approved' | 'rejected'>();
    });

    it('should handle nullable fields', () => {
      const schema = z.object({
        name: z.string(),
        description: z.string().nullable(),
      });

      const items = fromStandardSchema('items', schema);

      type ItemDoc = typeof items.$inferDocument;

      expectTypeOf<ItemDoc['name']>().toBeString();
      expectTypeOf<ItemDoc['description']>().toEqualTypeOf<string | null>();
    });

    it('should handle record types', () => {
      const schema = z.object({
        metadata: z.record(z.string(), z.unknown()),
      });

      const items = fromStandardSchema('items', schema);

      type ItemDoc = typeof items.$inferDocument;

      expectTypeOf<ItemDoc['metadata']>().toEqualTypeOf<Record<string, unknown>>();
    });
  });
});
