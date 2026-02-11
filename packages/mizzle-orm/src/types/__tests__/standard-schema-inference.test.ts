/**
 * Standard Schema inference type utility tests
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import type { InferSSDocument, InferSSInsert, InferSSUpdate } from '../standard-schema-inference';

// Type assertion helper - compilation will fail if types don't match
type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

describe('Standard Schema Inference Type Utilities', () => {
  describe('InferSSDocument', () => {
    it('should add _id: ObjectId when schema has no _id', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      type UserDoc = InferSSDocument<typeof userSchema>;

      // _id should be ObjectId
      type IdIsObjectId = Assert<AssertEqual<UserDoc['_id'], ObjectId>>;
      const _idCheck: IdIsObjectId = true;
      expect(_idCheck).toBe(true);

      // Other fields should match schema output
      type EmailIsString = Assert<AssertEqual<UserDoc['email'], string>>;
      type NameIsString = Assert<AssertEqual<UserDoc['name'], string>>;
      const _emailCheck: EmailIsString = true;
      const _nameCheck: NameIsString = true;
      expect(_emailCheck).toBe(true);
      expect(_nameCheck).toBe(true);
    });

    it('should preserve existing _id type when defined in schema', () => {
      const customIdSchema = z.object({
        _id: z.string().uuid(),
        name: z.string(),
      });

      type CustomDoc = InferSSDocument<typeof customIdSchema>;

      // _id should be string (from schema), not ObjectId
      type IdIsString = Assert<AssertEqual<CustomDoc['_id'], string>>;
      const _idCheck: IdIsString = true;
      expect(_idCheck).toBe(true);
    });

    it('should preserve existing ObjectId _id type when explicitly defined', () => {
      // Schema explicitly defines _id as ObjectId
      const explicitIdSchema = z.object({
        _id: z.instanceof(ObjectId),
        email: z.string(),
      });

      type ExplicitDoc = InferSSDocument<typeof explicitIdSchema>;

      // _id should be ObjectId as explicitly defined
      type IdIsObjectId = Assert<AssertEqual<ExplicitDoc['_id'], ObjectId>>;
      const _check: IdIsObjectId = true;
      expect(_check).toBe(true);
    });

    it('should handle complex nested objects', () => {
      const profileSchema = z.object({
        user: z.object({
          name: z.string(),
          settings: z.object({
            theme: z.enum(['light', 'dark']),
            notifications: z.boolean(),
          }),
        }),
        tags: z.array(z.string()),
      });

      type ProfileDoc = InferSSDocument<typeof profileSchema>;

      // _id should be added
      type HasObjectId = Assert<AssertEqual<ProfileDoc['_id'], ObjectId>>;
      const _idCheck: HasObjectId = true;
      expect(_idCheck).toBe(true);

      // Nested structures should be preserved
      type UserNameIsString = Assert<AssertEqual<ProfileDoc['user']['name'], string>>;
      type ThemeIsEnum = Assert<AssertEqual<ProfileDoc['user']['settings']['theme'], 'light' | 'dark'>>;
      type TagsIsArray = Assert<AssertEqual<ProfileDoc['tags'], string[]>>;

      const _nameCheck: UserNameIsString = true;
      const _themeCheck: ThemeIsEnum = true;
      const _tagsCheck: TagsIsArray = true;

      expect(_nameCheck).toBe(true);
      expect(_themeCheck).toBe(true);
      expect(_tagsCheck).toBe(true);
    });

    it('should handle schema with transforms', () => {
      const transformSchema = z.object({
        createdAt: z.string().transform((s) => new Date(s)),
        count: z.string().transform((s) => parseInt(s, 10)),
      });

      type TransformDoc = InferSSDocument<typeof transformSchema>;

      // Output types should be transformed
      type CreatedAtIsDate = Assert<AssertEqual<TransformDoc['createdAt'], Date>>;
      type CountIsNumber = Assert<AssertEqual<TransformDoc['count'], number>>;

      const _dateCheck: CreatedAtIsDate = true;
      const _countCheck: CountIsNumber = true;

      expect(_dateCheck).toBe(true);
      expect(_countCheck).toBe(true);
    });
  });

  describe('InferSSInsert', () => {
    it('should return schema input type', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
        age: z.number(),
      });

      type UserInsert = InferSSInsert<typeof userSchema>;

      type InsertShape = Assert<
        AssertEqual<UserInsert, { email: string; name: string; age: number }>
      >;
      const _check: InsertShape = true;
      expect(_check).toBe(true);
    });

    it('should handle optional fields', () => {
      const userSchema = z.object({
        email: z.string().email(),
        nickname: z.string().optional(),
      });

      type UserInsert = InferSSInsert<typeof userSchema>;

      type EmailRequired = Assert<AssertEqual<UserInsert['email'], string>>;
      type NicknameOptional = Assert<AssertEqual<UserInsert['nickname'], string | undefined>>;

      const _emailCheck: EmailRequired = true;
      const _nickCheck: NicknameOptional = true;

      expect(_emailCheck).toBe(true);
      expect(_nickCheck).toBe(true);
    });

    it('should handle default values (input before defaults applied)', () => {
      const userSchema = z.object({
        email: z.string().email(),
        role: z.enum(['user', 'admin']).default('user'),
      });

      type UserInsert = InferSSInsert<typeof userSchema>;

      // Role should be optional in input since it has a default
      // Note: Zod .default() makes the field optional in input
      type RoleIsOptional = Assert<AssertEqual<UserInsert['role'], 'user' | 'admin' | undefined>>;
      const _check: RoleIsOptional = true;
      expect(_check).toBe(true);
    });

    it('should use input type before transforms', () => {
      const schema = z.object({
        timestamp: z.string().transform((s) => new Date(s)),
      });

      type InsertType = InferSSInsert<typeof schema>;

      // Input should be string (before transform)
      type TimestampIsString = Assert<AssertEqual<InsertType['timestamp'], string>>;
      const _check: TimestampIsString = true;
      expect(_check).toBe(true);
    });
  });

  describe('InferSSUpdate', () => {
    it('should return partial document without _id', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
        age: z.number(),
      });

      type UserUpdate = InferSSUpdate<typeof userSchema>;

      // All fields should be optional
      type EmailOptional = Assert<AssertEqual<UserUpdate['email'], string | undefined>>;
      type NameOptional = Assert<AssertEqual<UserUpdate['name'], string | undefined>>;
      type AgeOptional = Assert<AssertEqual<UserUpdate['age'], number | undefined>>;

      const _emailCheck: EmailOptional = true;
      const _nameCheck: NameOptional = true;
      const _ageCheck: AgeOptional = true;

      expect(_emailCheck).toBe(true);
      expect(_nameCheck).toBe(true);
      expect(_ageCheck).toBe(true);
    });

    it('should exclude _id from update type', () => {
      const userSchema = z.object({
        email: z.string(),
        name: z.string(),
      });

      type UserUpdate = InferSSUpdate<typeof userSchema>;

      // _id should not be in the update type
      type NoIdInUpdate = Assert<AssertEqual<'_id' extends keyof UserUpdate ? false : true, true>>;
      const _check: NoIdInUpdate = true;
      expect(_check).toBe(true);
    });

    it('should exclude _id even when defined in schema', () => {
      const customSchema = z.object({
        _id: z.string().uuid(),
        name: z.string(),
      });

      type CustomUpdate = InferSSUpdate<typeof customSchema>;

      // _id should be excluded
      type NoIdInUpdate = Assert<AssertEqual<'_id' extends keyof CustomUpdate ? false : true, true>>;
      const _check: NoIdInUpdate = true;
      expect(_check).toBe(true);

      // name should be present and optional
      type NameOptional = Assert<AssertEqual<CustomUpdate['name'], string | undefined>>;
      const _nameCheck: NameOptional = true;
      expect(_nameCheck).toBe(true);
    });

    it('should use output type (after transforms) for updates', () => {
      const schema = z.object({
        timestamp: z.string().transform((s) => new Date(s)),
        count: z.number(),
      });

      type UpdateType = InferSSUpdate<typeof schema>;

      // Update should use output type (Date, not string)
      type TimestampIsDate = Assert<AssertEqual<UpdateType['timestamp'], Date | undefined>>;
      type CountIsNumber = Assert<AssertEqual<UpdateType['count'], number | undefined>>;

      const _tsCheck: TimestampIsDate = true;
      const _countCheck: CountIsNumber = true;

      expect(_tsCheck).toBe(true);
      expect(_countCheck).toBe(true);
    });
  });

  describe('vitest expectTypeOf assertions', () => {
    it('should verify InferSSDocument adds _id: ObjectId', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string(),
      });

      expectTypeOf<InferSSDocument<typeof schema>>().toMatchTypeOf<{
        _id: ObjectId;
        name: string;
        email: string;
      }>();
    });

    it('should verify InferSSDocument preserves custom _id', () => {
      const schema = z.object({
        _id: z.string(),
        name: z.string(),
      });

      expectTypeOf<InferSSDocument<typeof schema>>().toMatchTypeOf<{
        _id: string;
        name: string;
      }>();
    });

    it('should verify InferSSInsert matches schema input', () => {
      const schema = z.object({
        email: z.string(),
        count: z.number(),
      });

      expectTypeOf<InferSSInsert<typeof schema>>().toEqualTypeOf<{
        email: string;
        count: number;
      }>();
    });

    it('should verify InferSSUpdate is partial without _id', () => {
      const schema = z.object({
        email: z.string(),
        name: z.string(),
      });

      type Update = InferSSUpdate<typeof schema>;

      // Should be partial
      expectTypeOf<Update>().toMatchTypeOf<Partial<{ email: string; name: string }>>();

      // Should not have _id
      expectTypeOf<Update>().not.toHaveProperty('_id');
    });
  });

  describe('integration scenarios', () => {
    it('should work with realistic user schema', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(['user', 'admin', 'moderator']).default('user'),
        createdAt: z.date().default(() => new Date()),
        settings: z
          .object({
            theme: z.enum(['light', 'dark']).default('light'),
            language: z.string().default('en'),
          })
          .optional(),
      });

      type UserDoc = InferSSDocument<typeof userSchema>;
      type UserInsert = InferSSInsert<typeof userSchema>;
      type UserUpdate = InferSSUpdate<typeof userSchema>;

      // Document should have _id: ObjectId
      expectTypeOf<UserDoc['_id']>().toEqualTypeOf<ObjectId>();

      // Insert should match Zod input (with defaults as optional)
      expectTypeOf<UserInsert['email']>().toEqualTypeOf<string>();

      // Update should be partial
      expectTypeOf<UserUpdate['email']>().toEqualTypeOf<string | undefined>();
    });

    it('should work with complex nested schema', () => {
      const orderSchema = z.object({
        customerId: z.string(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().positive(),
            price: z.number().positive(),
          })
        ),
        total: z.number(),
        status: z.enum(['pending', 'shipped', 'delivered']),
      });

      type OrderDoc = InferSSDocument<typeof orderSchema>;
      type OrderUpdate = InferSSUpdate<typeof orderSchema>;

      // Document has _id
      expectTypeOf<OrderDoc['_id']>().toEqualTypeOf<ObjectId>();

      // Items array is preserved
      expectTypeOf<OrderDoc['items']>().toMatchTypeOf<
        Array<{ productId: string; quantity: number; price: number }>
      >();

      // Update is partial
      expectTypeOf<OrderUpdate['status']>().toEqualTypeOf<
        'pending' | 'shipped' | 'delivered' | undefined
      >();
    });
  });
});
