/**
 * Tests for fromZod convenience wrapper
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { expectTypeOf } from 'vitest';
import { ObjectId } from 'mongodb';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import {
  fromZod,
  isZodSchema,
  isZodCollectionDefinition,
  extractZodDefaults,
  applyZodDefaults,
  validateWithZod,
  ZodValidationError,
} from '../from-zod';
import { isSSCollectionDefinition } from '../from-standard-schema';

describe('fromZod', () => {
  describe('isZodSchema', () => {
    it('should return true for Zod schemas', () => {
      const schema = z.object({ name: z.string() });
      expect(isZodSchema(schema)).toBe(true);
    });

    it('should return true for simple Zod types', () => {
      expect(isZodSchema(z.string())).toBe(true);
      expect(isZodSchema(z.number())).toBe(true);
      expect(isZodSchema(z.boolean())).toBe(true);
      expect(isZodSchema(z.array(z.string()))).toBe(true);
    });

    it('should return false for plain objects', () => {
      expect(isZodSchema({ name: 'test' })).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
    });

    it('should return false for non-Zod validation libraries', () => {
      // Mock a non-Zod Standard Schema (no safeParse)
      const mockSchema = {
        '~standard': {
          version: 1,
          vendor: 'other',
          validate: () => ({ value: {} }),
        },
      };
      expect(isZodSchema(mockSchema)).toBe(false);
    });
  });

  describe('extractZodDefaults', () => {
    it('should extract simple default values', () => {
      const schema = z.object({
        role: z.string().default('user'),
        count: z.number().default(0),
        active: z.boolean().default(true),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults).toEqual({
        role: 'user',
        count: 0,
        active: true,
      });
    });

    it('should extract default values from optional fields with defaults', () => {
      const schema = z.object({
        name: z.string(),
        nickname: z.string().optional().default('Anonymous'),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults.nickname).toBe('Anonymous');
      expect(defaults.name).toBeUndefined();
    });

    it('should extract object defaults', () => {
      const schema = z.object({
        settings: z.object({
          theme: z.string(),
        }).default({ theme: 'dark' }),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults.settings).toEqual({ theme: 'dark' });
    });

    it('should extract array defaults', () => {
      const schema = z.object({
        tags: z.array(z.string()).default(['general']),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults.tags).toEqual(['general']);
    });

    it('should return empty object for schemas without defaults', () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults).toEqual({});
    });

    it('should return empty object for non-object schemas', () => {
      const schema = z.string();

      const defaults = extractZodDefaults(schema as any);

      expect(defaults).toEqual({});
    });

    it('should extract enum defaults', () => {
      const schema = z.object({
        status: z.enum(['active', 'inactive', 'pending']).default('pending'),
      });

      const defaults = extractZodDefaults(schema);

      expect(defaults.status).toBe('pending');
    });
  });

  describe('applyZodDefaults', () => {
    it('should apply defaults to empty object', () => {
      const defaults = { role: 'user', count: 0 };
      const data = {};

      const result = applyZodDefaults(data, defaults);

      expect(result).toEqual({ role: 'user', count: 0 });
    });

    it('should not override existing values', () => {
      const defaults = { role: 'user', count: 0 };
      const data = { role: 'admin', name: 'Test' };

      const result = applyZodDefaults(data, defaults);

      expect(result).toEqual({ role: 'admin', name: 'Test', count: 0 });
    });

    it('should apply defaults for undefined values', () => {
      const defaults = { role: 'user' };
      const data = { role: undefined, name: 'Test' };

      const result = applyZodDefaults(data as any, defaults);

      expect(result).toEqual({ role: 'user', name: 'Test' });
    });

    it('should preserve null values (not apply defaults)', () => {
      const defaults = { role: 'user' };
      const data = { role: null, name: 'Test' };

      const result = applyZodDefaults(data as any, defaults);

      // null is a valid value, not undefined - should not apply default
      expect(result.role).toBe(null);
    });
  });

  describe('validateWithZod', () => {
    it('should return parsed data on success', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const result = validateWithZod(schema, { name: 'Test', age: 25 });

      expect(result).toEqual({ name: 'Test', age: 25 });
    });

    it('should throw ZodValidationError on failure', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      expect(() => validateWithZod(schema, { email: 'invalid' }))
        .toThrow(ZodValidationError);
    });

    it('should apply transforms', () => {
      const schema = z.object({
        slug: z.string().transform((s) => s.toLowerCase().replace(/\s+/g, '-')),
      });

      const result = validateWithZod(schema, { slug: 'Hello World' });

      expect(result.slug).toBe('hello-world');
    });

    it('should apply defaults during validation', () => {
      const schema = z.object({
        role: z.string().default('user'),
        name: z.string(),
      });

      const result = validateWithZod(schema, { name: 'Test' });

      expect(result).toEqual({ role: 'user', name: 'Test' });
    });

    describe('partial validation', () => {
      it('should pass for partial updates with valid fields', () => {
        const schema = z.object({
          email: z.string().email(),
          name: z.string().min(1),
        });

        // Only updating name, email missing is OK
        const result = validateWithZod(schema, { name: 'Updated' }, { partial: true });

        expect(result).toEqual({ name: 'Updated' });
      });

      it('should fail for partial updates with invalid fields', () => {
        const schema = z.object({
          email: z.string().email(),
          name: z.string().min(1),
        });

        expect(() => validateWithZod(schema, { name: '' }, { partial: true }))
          .toThrow(ZodValidationError);
      });
    });
  });

  describe('ZodValidationError', () => {
    it('should include formatted field errors in message', () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(1),
      });

      try {
        validateWithZod(schema, { email: 'invalid', name: '' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodValidationError);
        const zodError = error as ZodValidationError;
        expect(zodError.message).toContain('email');
        expect(zodError.message).toContain('name');
      }
    });

    it('should provide format() method', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      try {
        validateWithZod(schema, { email: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;
        const formatted = zodError.format();

        expect(formatted).toBeDefined();
        expect(formatted._errors).toEqual([]);
        expect((formatted.email as any)._errors).toBeDefined();
      }
    });

    it('should provide flatten() method', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0),
      });

      try {
        validateWithZod(schema, { email: 'invalid', age: -1 });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;
        const flattened = zodError.flatten();

        expect(flattened.formErrors).toEqual([]);
        expect(flattened.fieldErrors.email).toBeDefined();
        expect(flattened.fieldErrors.age).toBeDefined();
      }
    });

    it('should provide getFieldErrors() method', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      try {
        validateWithZod(schema, { email: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;
        const emailErrors = zodError.getFieldErrors('email');

        expect(emailErrors.length).toBeGreaterThan(0);
        expect(zodError.getFieldErrors('nonexistent')).toEqual([]);
      }
    });

    it('should provide errorFields getter', () => {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().min(5),
      });

      try {
        validateWithZod(schema, { email: 'invalid', name: 'a' });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;
        const fields = zodError.errorFields;

        expect(fields).toContain('email');
        expect(fields).toContain('name');
      }
    });

    it('should provide toJSON() method', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      try {
        validateWithZod(schema, { email: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;
        const json = zodError.toJSON();

        expect(json.name).toBe('ZodValidationError');
        expect(json.message).toBeDefined();
        expect(json.issues).toBeDefined();
        expect(json.formatted).toBeDefined();
        expect(json.flattened).toBeDefined();
      }
    });

    it('should include Standard Schema compatible issues', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      try {
        validateWithZod(schema, { email: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        const zodError = error as ZodValidationError;

        expect(zodError.issues).toBeDefined();
        expect(zodError.issues.length).toBeGreaterThan(0);
        expect(zodError.issues[0].message).toBeDefined();
        expect(zodError.issues[0].path).toEqual(['email']);
      }
    });
  });

  describe('fromZod factory', () => {
    it('should create a collection definition', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromZod('zod_users', userSchema);

      expect(users._meta.name).toBe('zod_users');
      expect(users._schema).toBe(userSchema);
      expect(users._brand).toBe('SSCollectionDefinition');
    });

    it('should be recognized as SS collection definition', () => {
      const schema = z.object({ name: z.string() });
      const collection = fromZod('test', schema);

      expect(isSSCollectionDefinition(collection)).toBe(true);
    });

    it('should be recognized as Zod collection definition', () => {
      const schema = z.object({ name: z.string() });
      const collection = fromZod('test', schema);

      expect(isZodCollectionDefinition(collection)).toBe(true);
    });

    it('should store the original Zod schema', () => {
      const userSchema = z.object({
        email: z.string().email(),
      });

      const users = fromZod('zod_users', userSchema);

      expect(users._meta.zodSchema).toBe(userSchema);
      expect(users._meta.isZod).toBe(true);
    });

    it('should extract and store defaults', () => {
      const userSchema = z.object({
        email: z.string().email(),
        role: z.enum(['user', 'admin']).default('user'),
        active: z.boolean().default(true),
      });

      const users = fromZod('zod_users', userSchema);

      expect(users._meta.defaults).toEqual({
        role: 'user',
        active: true,
      });
    });

    it('should throw for non-Zod schemas', () => {
      const notZod = {
        '~standard': {
          version: 1,
          vendor: 'other',
          validate: () => ({ value: {} }),
        },
      };

      expect(() => fromZod('test', notZod as any))
        .toThrow('must be a Zod schema');
    });

    it('should accept options like publicId', () => {
      const schema = z.object({ name: z.string() });

      const collection = fromZod('test', schema, {
        publicId: 'test',
      });

      expect(collection._meta.publicIdConfig).toEqual({
        prefix: 'test',
        field: 'id',
      });
    });

    it('should accept options like softDelete', () => {
      const schema = z.object({ name: z.string() });

      const collection = fromZod('test', schema, {
        softDelete: true,
      });

      expect(collection._meta.softDeleteConfig).toEqual({
        field: 'deletedAt',
      });
    });

    it('should accept options like timestamps', () => {
      const schema = z.object({ name: z.string() });

      const collection = fromZod('test', schema, {
        timestamps: true,
      });

      expect(collection._meta.timestampsConfig).toEqual({
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      });
    });

    it('should accept combined options', () => {
      const schema = z.object({ name: z.string() });

      const collection = fromZod('test', schema, {
        publicId: 'item',
        softDelete: true,
        timestamps: { createdAt: 'created', updatedAt: 'modified' },
      });

      expect(collection._meta.publicIdConfig?.prefix).toBe('item');
      expect(collection._meta.softDeleteConfig?.field).toBe('deletedAt');
      expect(collection._meta.timestampsConfig?.createdAt).toBe('created');
      expect(collection._meta.timestampsConfig?.updatedAt).toBe('modified');
    });
  });

  describe('type inference', () => {
    it('should infer document type correctly', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
        age: z.number().optional(),
      });

      const users = fromZod('zod_users', userSchema);

      type Doc = typeof users.$inferDocument;

      // Type assertions at compile time
      expectTypeOf<Doc>().toHaveProperty('_id');
      expectTypeOf<Doc>().toHaveProperty('email');
      expectTypeOf<Doc>().toHaveProperty('name');
      expectTypeOf<Doc>().toHaveProperty('age');
    });

    it('should infer insert type correctly', () => {
      const userSchema = z.object({
        email: z.string().email(),
        role: z.enum(['user', 'admin']).default('user'),
      });

      const users = fromZod('zod_users', userSchema);

      type Insert = typeof users.$inferInsert;

      // Insert type should have optional role (due to default)
      expectTypeOf<Insert>().toHaveProperty('email');
      expectTypeOf<Insert>().toHaveProperty('role');
    });

    it('should infer update type correctly', () => {
      const userSchema = z.object({
        email: z.string().email(),
        name: z.string(),
      });

      const users = fromZod('zod_users', userSchema);

      type Update = typeof users.$inferUpdate;

      // Update should be partial and not include _id
      expectTypeOf<Update>().toMatchTypeOf<{ email?: string; name?: string }>();
    });
  });

  describe('integration: defaults on insert', () => {
    let db: any;

    const userSchema = z.object({
      email: z.string().email(),
      role: z.enum(['user', 'admin']).default('user'),
      settings: z.object({
        theme: z.string(),
      }).default({ theme: 'light' }),
    });

    const users = fromZod('zod_users_defaults', userSchema);

    beforeAll(async () => {
      db = await createTestOrm({ users });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should apply Zod defaults on insert', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
      });

      expect(created.email).toBe('test@example.com');
      expect(created.role).toBe('user');
      expect(created.settings).toEqual({ theme: 'light' });
    });

    it('should not override provided values with defaults', async () => {
      const created = await db().users.create({
        email: 'admin@example.com',
        role: 'admin',
      });

      expect(created.role).toBe('admin');
    });
  });

  describe('integration: validation errors', () => {
    let db: any;

    const userSchema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
    });

    const users = fromZod('zod_users_validation', userSchema);

    beforeAll(async () => {
      db = await createTestOrm({ users });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should throw ZodValidationError on invalid insert', async () => {
      try {
        await db().users.create({
          email: 'invalid-email',
          name: '',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodValidationError);
        const zodError = error as ZodValidationError;
        expect(zodError.errorFields).toContain('email');
        expect(zodError.errorFields).toContain('name');
      }
    });
  });

  describe('integration: partial updates', () => {
    let db: any;

    const userSchema = z.object({
      email: z.string().email(),
      name: z.string(),
      age: z.number().min(0).optional(),
      bio: z.string().optional(),
    });

    const users = fromZod('zod_users_partial', userSchema);

    beforeAll(async () => {
      db = await createTestOrm({ users });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should throw ZodValidationError on invalid update', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
        name: 'Test',
        age: 25,
      });

      try {
        await db().users.updateById(created._id, { age: -5 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodValidationError);
        const zodError = error as ZodValidationError;
        expect(zodError.errorFields).toContain('age');
      }
    });

    it('should allow partial updates without required fields', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      // Update only bio - should not fail due to missing email/name
      const updated = await db().users.updateById(created._id, { bio: 'Hello!' });

      expect(updated?.bio).toBe('Hello!');
      expect(updated?.email).toBe('test@example.com');
    });
  });

  describe('integration: with options', () => {
    let db: any;

    const userSchema = z.object({
      email: z.string().email(),
      role: z.enum(['user', 'admin']).default('user'),
    });

    const users = fromZod('zod_users_options', userSchema, {
      publicId: 'user',
      timestamps: true,
      softDelete: true,
    });

    beforeAll(async () => {
      db = await createTestOrm({ users });
    });

    afterAll(async () => {
      await teardownTestDb();
    });

    beforeEach(async () => {
      await clearTestDb();
    });

    it('should work with publicId option', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
      });

      expect(created.id).toBeDefined();
      expect(created.id).toMatch(/^user_/);
    });

    it('should work with timestamps option', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
      });

      expect(created.createdAt).toBeInstanceOf(Date);

      // Wait a bit and update
      await new Promise((r) => setTimeout(r, 10));
      const updated = await db().users.updateById(created._id, {
        email: 'new@example.com',
      });

      expect(updated?.updatedAt).toBeInstanceOf(Date);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.createdAt.getTime());
    });

    it('should work with softDelete option', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
      });

      await db().users.softDelete(created._id);

      // Should not find soft-deleted document
      const found = await db().users.findById(created._id);
      expect(found).toBeNull();

      // Restore and find again
      await db().users.restore(created._id);
      const restored = await db().users.findById(created._id);
      expect(restored).not.toBeNull();
    });

    it('should combine defaults with ORM-generated fields', async () => {
      const created = await db().users.create({
        email: 'test@example.com',
      });

      // Zod default
      expect(created.role).toBe('user');
      // ORM-generated publicId
      expect(created.id).toMatch(/^user_/);
      // ORM-generated timestamp
      expect(created.createdAt).toBeInstanceOf(Date);
    });
  });
});
