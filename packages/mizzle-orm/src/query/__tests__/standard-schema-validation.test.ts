/**
 * Standard Schema validation integration tests
 * Tests that insert/update operations validate data using Standard Schema
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { fromStandardSchema } from '../../collection/from-standard-schema';
import { mongoCollection } from '../../collection/collection';
import { string, number } from '../../schema/fields';
import { SSValidationError } from '../../errors/validation-error';
import type { Mizzle } from '../../types/orm';

describe('Standard Schema Validation', () => {
  // Standard Schema collection using Zod
  const userSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    age: z.number().int().positive().optional(),
    role: z.enum(['user', 'admin']).default('user'),
  });

  const users = fromStandardSchema('ss_users', userSchema);

  // Regular field-builder collection for comparison
  const legacyUsers = mongoCollection('legacy_users', {
    email: string().email(),
    name: string(),
    age: number().int().positive().optional(),
  });

  let db: Mizzle<{ users: typeof users; legacyUsers: typeof legacyUsers }>;

  beforeAll(async () => {
    db = await createTestOrm({ users, legacyUsers });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('create() validation', () => {
    it('should accept valid data', async () => {
      const user = await db().users.create({
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user._id).toBeInstanceOf(ObjectId);
    });

    it('should reject invalid email', async () => {
      await expect(
        db().users.create({
          email: 'not-an-email',
          name: 'Test User',
        }),
      ).rejects.toThrow(SSValidationError);
    });

    it('should reject empty name', async () => {
      await expect(
        db().users.create({
          email: 'test@example.com',
          name: '',
        }),
      ).rejects.toThrow(SSValidationError);
    });

    it('should reject negative age', async () => {
      await expect(
        db().users.create({
          email: 'test@example.com',
          name: 'Test User',
          age: -5,
        }),
      ).rejects.toThrow(SSValidationError);
    });

    it('should include issues array in SSValidationError', async () => {
      try {
        await db().users.create({
          email: 'invalid',
          name: '',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        expect(validationError.issues).toBeDefined();
        expect(validationError.issues.length).toBeGreaterThan(0);
        // Should have issues for both email and name
        expect(validationError.issues.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should include descriptive error message', async () => {
      try {
        await db().users.create({
          email: 'invalid',
          name: 'Test',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        expect(validationError.message).toContain('Validation failed');
      }
    });

    it('should include path information in issues', async () => {
      try {
        await db().users.create({
          email: 'invalid-email',
          name: 'Test',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        const emailIssue = validationError.issues.find(
          (issue) => issue.path && issue.path.includes('email'),
        );
        expect(emailIssue).toBeDefined();
      }
    });
  });

  describe('updateOne() validation', () => {
    let existingUserId: ObjectId;

    beforeEach(async () => {
      // Create a valid user first
      const user = await db().users.create({
        email: 'existing@example.com',
        name: 'Existing User',
      });
      existingUserId = user._id;
    });

    it('should accept valid update data', async () => {
      const updated = await db().users.updateOne(
        { _id: existingUserId },
        { name: 'Updated Name' },
      );

      expect(updated?.name).toBe('Updated Name');
    });

    it('should allow partial updates without requiring all fields', async () => {
      // Partial updates only contain the fields being changed
      // Validation should NOT fail just because email is missing - 
      // we only validate the fields present in the update
      const updated = await db().users.updateOne(
        { _id: existingUserId },
        { name: 'New Name' },
      );

      expect(updated?.name).toBe('New Name');
      expect(updated?.email).toBe('existing@example.com'); // Original value preserved
    });

    it('should reject invalid update values for name', async () => {
      // Even in partial updates, the provided fields should be validated
      await expect(
        db().users.updateOne(
          { _id: existingUserId },
          { name: '' }, // Invalid: min length is 1
        ),
      ).rejects.toThrow(SSValidationError);
    });

    it('should reject invalid update values for age', async () => {
      await expect(
        db().users.updateOne(
          { _id: existingUserId },
          { age: -10 }, // Invalid: must be positive
        ),
      ).rejects.toThrow(SSValidationError);
    });

    it('should reject invalid enum values in update', async () => {
      await expect(
        db().users.updateOne(
          { _id: existingUserId },
          { role: 'superadmin' as any }, // Invalid: not in enum
        ),
      ).rejects.toThrow(SSValidationError);
    });

    it('should include issues array for invalid updates', async () => {
      try {
        await db().users.updateOne(
          { _id: existingUserId },
          { name: '' },
        );
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        expect(validationError.issues).toBeDefined();
        expect(validationError.issues.length).toBeGreaterThan(0);
        // Issue should be for the 'name' field
        const nameIssue = validationError.issues.find(
          (issue) => issue.path && issue.path.includes('name'),
        );
        expect(nameIssue).toBeDefined();
      }
    });
  });

  describe('updateMany() validation', () => {
    beforeEach(async () => {
      // Create multiple users
      await db().users.create({ email: 'user1@example.com', name: 'User 1' });
      await db().users.create({ email: 'user2@example.com', name: 'User 2' });
    });

    it('should accept valid update data', async () => {
      const count = await db().users.updateMany({}, { role: 'admin' as const });
      expect(count).toBe(2);
    });

    it('should allow partial bulk updates without requiring all fields', async () => {
      const count = await db().users.updateMany({}, { name: 'Bulk Updated' });
      expect(count).toBe(2);
    });

    it('should reject invalid values in bulk update', async () => {
      await expect(
        db().users.updateMany({}, { name: '' }), // Invalid: empty string
      ).rejects.toThrow(SSValidationError);
    });

    it('should reject invalid age in bulk update', async () => {
      await expect(
        db().users.updateMany({}, { age: -5 }), // Invalid: must be positive
      ).rejects.toThrow(SSValidationError);
    });
  });

  describe('backward compatibility with field-builder collections', () => {
    it('should skip validation for non-SS collections on create', async () => {
      // Legacy collections don't use Standard Schema validation
      // They may have their own validation via middlewares or hooks
      const user = await db().legacyUsers.create({
        email: 'test@example.com',
        name: 'Test',
      });

      expect(user.name).toBe('Test');
      expect(user._id).toBeInstanceOf(ObjectId);
    });

    it('should skip validation for non-SS collections on update', async () => {
      const user = await db().legacyUsers.create({
        email: 'test@example.com',
        name: 'Test',
      });

      // Update should work without Standard Schema validation
      const updated = await db().legacyUsers.updateOne(
        { _id: user._id },
        { name: 'Updated' },
      );

      expect(updated?.name).toBe('Updated');
    });

    it('should not throw SSValidationError for field-builder collections', async () => {
      // Even with potentially invalid data (if it were validated),
      // field-builder collections don't use SSValidationError
      const user = await db().legacyUsers.create({
        email: 'test@example.com',
        name: 'Test',
      });

      // This should not throw SSValidationError
      const updated = await db().legacyUsers.updateOne(
        { _id: user._id },
        { name: 'New Name' },
      );

      expect(updated?.name).toBe('New Name');
    });
  });

  describe('SSValidationError helpers', () => {
    it('should provide paths getter', async () => {
      try {
        await db().users.create({
          email: 'invalid',
          name: '',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        expect(validationError.paths).toBeDefined();
        expect(Array.isArray(validationError.paths)).toBe(true);
      }
    });

    it('should support toJSON for serialization', async () => {
      try {
        await db().users.create({
          email: 'bad',
          name: 'Test',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        const json = validationError.toJSON();
        expect(json.name).toBe('SSValidationError');
        expect(json.message).toBeDefined();
        expect(json.issues).toBeDefined();
        expect(Array.isArray(json.issues)).toBe(true);
      }
    });

    it('should find issues at specific path', async () => {
      try {
        await db().users.create({
          email: 'not-valid',
          name: 'Test',
        });
        expect.fail('Should have thrown SSValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SSValidationError);
        const validationError = error as SSValidationError;
        const emailIssues = validationError.getIssuesAtPath(['email']);
        expect(emailIssues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validation with optional fields', () => {
    it('should accept missing optional fields', async () => {
      const user = await db().users.create({
        email: 'test@example.com',
        name: 'Test User',
        // age is optional, not provided
      });

      expect(user.age).toBeUndefined();
    });

    it('should validate optional fields when provided', async () => {
      // Providing an invalid value for optional field should fail
      await expect(
        db().users.create({
          email: 'test@example.com',
          name: 'Test User',
          age: -5, // invalid: must be positive
        }),
      ).rejects.toThrow(SSValidationError);
    });

    it('should accept valid optional fields', async () => {
      const user = await db().users.create({
        email: 'test@example.com',
        name: 'Test User',
        age: 25,
      });

      expect(user.age).toBe(25);
    });
  });

  describe('validation with enums', () => {
    it('should accept valid enum values', async () => {
      const user = await db().users.create({
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin' as const,
      });

      expect(user.role).toBe('admin');
    });

    it('should reject invalid enum values', async () => {
      await expect(
        db().users.create({
          email: 'test@example.com',
          name: 'Test',
          role: 'superuser' as any, // invalid enum value
        }),
      ).rejects.toThrow(SSValidationError);
    });
  });
});
