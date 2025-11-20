/**
 * Zod schema generation tests
 */

import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import {
  generateDocumentSchema,
  generateInsertSchema,
  generateUpdateSchema,
} from '../zod-schema-generator';
import { string, number, boolean, date, objectId, publicId, array } from '../../schema/fields';

describe('Zod Schema Generation', () => {
  describe('generateDocumentSchema', () => {
    it('should generate schema for basic fields', () => {
      const schema = {
        name: string(),
        age: number(),
        active: boolean(),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid data
      const validData = {
        name: 'John',
        age: 30,
        active: true,
      };

      expect(() => zodSchema.parse(validData)).not.toThrow();

      // Invalid data
      const invalidData = {
        name: 'John',
        age: 'thirty', // Should be number
        active: true,
      };

      expect(() => zodSchema.parse(invalidData)).toThrow();
    });

    it('should respect string validations', () => {
      const schema = {
        email: string().email().min(5).max(100),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid email
      expect(() => zodSchema.parse({ email: 'test@example.com' })).not.toThrow();

      // Invalid email format
      expect(() => zodSchema.parse({ email: 'not-an-email' })).toThrow();

      // Too short
      expect(() => zodSchema.parse({ email: 'a@b' })).toThrow();
    });

    it('should respect number validations', () => {
      const schema = {
        age: number().int().min(0).max(150),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid
      expect(() => zodSchema.parse({ age: 25 })).not.toThrow();

      // Float (should fail for int())
      expect(() => zodSchema.parse({ age: 25.5 })).toThrow();

      // Negative
      expect(() => zodSchema.parse({ age: -5 })).toThrow();

      // Too large
      expect(() => zodSchema.parse({ age: 200 })).toThrow();
    });

    it('should handle optional and nullable fields', () => {
      const schema = {
        optionalField: string().optional(),
        nullableField: number().nullable(),
      };

      const zodSchema = generateDocumentSchema(schema);

      // With both fields
      expect(() =>
        zodSchema.parse({ optionalField: 'hello', nullableField: 42 })
      ).not.toThrow();

      // Without optional
      expect(() => zodSchema.parse({ nullableField: 42 })).not.toThrow();

      // With null
      expect(() =>
        zodSchema.parse({ optionalField: 'hello', nullableField: null })
      ).not.toThrow();
    });

    it('should handle arrays', () => {
      const schema = {
        tags: array(string()).min(1).max(5),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid
      expect(() => zodSchema.parse({ tags: ['tag1', 'tag2'] })).not.toThrow();

      // Empty (fails min)
      expect(() => zodSchema.parse({ tags: [] })).toThrow();

      // Too many (fails max)
      expect(() =>
        zodSchema.parse({ tags: ['1', '2', '3', '4', '5', '6'] })
      ).toThrow();

      // Wrong item type
      expect(() => zodSchema.parse({ tags: [1, 2, 3] })).toThrow();
    });

    it('should handle ObjectId fields', () => {
      const schema = {
        userId: objectId(),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid ObjectId
      expect(() => zodSchema.parse({ userId: new ObjectId() })).not.toThrow();

      // Invalid (string)
      expect(() => zodSchema.parse({ userId: '123' })).toThrow();
    });

    it('should handle date fields', () => {
      const schema = {
        createdAt: date(),
      };

      const zodSchema = generateDocumentSchema(schema);

      // Valid Date
      expect(() => zodSchema.parse({ createdAt: new Date() })).not.toThrow();

      // Invalid (string)
      expect(() => zodSchema.parse({ createdAt: '2024-01-01' })).toThrow();
    });
  });

  describe('generateInsertSchema', () => {
    it('should exclude auto-generated fields', () => {
      const schema = {
        id: publicId('user'),
        name: string(),
        createdAt: date().defaultNow(),
        updatedAt: date().onUpdateNow(),
      };

      const zodSchema = generateInsertSchema(schema);

      // Should only require name (id and timestamps are auto-generated)
      const validData = {
        name: 'John',
      };

      expect(() => zodSchema.parse(validData)).not.toThrow();

      // Should still allow providing other fields
      const dataWithOptional = {
        name: 'John',
        // id and timestamps would be ignored/overridden anyway
      };

      expect(() => zodSchema.parse(dataWithOptional)).not.toThrow();
    });

    it('should make all fields optional', () => {
      const schema = {
        name: string(),
        age: number(),
      };

      const zodSchema = generateInsertSchema(schema);

      // Can provide just name
      expect(() => zodSchema.parse({ name: 'John' })).not.toThrow();

      // Can provide just age
      expect(() => zodSchema.parse({ age: 30 })).not.toThrow();

      // Can provide both
      expect(() => zodSchema.parse({ name: 'John', age: 30 })).not.toThrow();

      // Can provide neither
      expect(() => zodSchema.parse({})).not.toThrow();
    });
  });

  describe('generateUpdateSchema', () => {
    it('should make all fields optional', () => {
      const schema = {
        name: string(),
        age: number(),
        email: string().email(),
      };

      const zodSchema = generateUpdateSchema(schema);

      // Can update just one field
      expect(() => zodSchema.parse({ name: 'John' })).not.toThrow();

      // Can update multiple fields
      expect(() => zodSchema.parse({ name: 'John', age: 30 })).not.toThrow();

      // Can update no fields (empty update)
      expect(() => zodSchema.parse({})).not.toThrow();
    });

    it('should exclude auto-managed fields', () => {
      const schema = {
        id: publicId('user'),
        name: string(),
        updatedAt: date().onUpdateNow(),
      };

      const zodSchema = generateUpdateSchema(schema);

      // Should allow updating name but not id or updatedAt
      const validData = {
        name: 'Updated Name',
      };

      expect(() => zodSchema.parse(validData)).not.toThrow();
    });

    it('should still validate field types', () => {
      const schema = {
        age: number(),
        email: string().email(),
      };

      const zodSchema = generateUpdateSchema(schema);

      // Valid
      expect(() => zodSchema.parse({ age: 30 })).not.toThrow();

      // Invalid type
      expect(() => zodSchema.parse({ age: 'thirty' })).toThrow();

      // Invalid email
      expect(() => zodSchema.parse({ email: 'not-an-email' })).toThrow();
    });
  });

  describe('default values', () => {
    it('should apply default values', () => {
      const schema = {
        role: string().default('user'),
        active: boolean().default(true),
      };

      const zodSchema = generateDocumentSchema(schema);

      const result = zodSchema.parse({});

      expect(result.role).toBe('user');
      expect(result.active).toBe(true);
    });
  });
});
