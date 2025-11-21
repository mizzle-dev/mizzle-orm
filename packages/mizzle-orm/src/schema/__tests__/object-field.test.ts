/**
 * Object field builder tests
 */

import { describe, it, expect } from 'vitest';
import { object, string, number, boolean, array } from '../fields';
import type { InferFieldBuilderType } from '../../types/field';

describe('Object Field Builder', () => {
  describe('Basic Usage', () => {
    it('should create an object field with schema', () => {
      const field = object({
        name: string(),
        age: number(),
        isActive: boolean(),
      });

      expect(field._config.type).toBe('object');
      expect(field._config.objectConfig?.schema).toBeDefined();
      expect(field._schema).toBeDefined();
    });

    it('should create an untyped object field', () => {
      const field = object();

      expect(field._config.type).toBe('object');
      expect(field._schema).toEqual({});
    });
  });

  describe('Type Inference', () => {
    it('should infer correct type for simple object', () => {
      const field = object({
        name: string(),
        age: number(),
      });

      type Inferred = InferFieldBuilderType<typeof field>;

      // Type test - will fail to compile if wrong
      const test: Inferred = {
        name: 'Alice',
        age: 30,
      };

      expect(test).toBeDefined();
    });

    it('should infer correct type for nested objects', () => {
      const field = object({
        user: object({
          name: string(),
          email: string(),
        }),
        settings: object({
          theme: string(),
          notifications: boolean(),
        }),
      });

      type Inferred = InferFieldBuilderType<typeof field>;

      const test: Inferred = {
        user: {
          name: 'Bob',
          email: 'bob@example.com',
        },
        settings: {
          theme: 'dark',
          notifications: true,
        },
      };

      expect(test).toBeDefined();
    });

    it('should handle optional fields in nested objects', () => {
      const field = object({
        name: string(),
        metadata: object({
          tags: array(string()).optional(),
          priority: number().optional(),
        }).optional(),
      });

      type Inferred = InferFieldBuilderType<typeof field>;

      // Valid with metadata
      const test1: Inferred = {
        name: 'Test',
        metadata: {
          tags: ['a', 'b'],
        },
      };

      // Valid without metadata
      const test2: Inferred = {
        name: 'Test',
      };

      expect(test1).toBeDefined();
      expect(test2).toBeDefined();
    });
  });

  describe('Chainable Methods', () => {
    it('should support optional()', () => {
      const field = object({
        name: string(),
      }).optional();

      expect(field._config.optional).toBe(true);
    });

    it('should support nullable()', () => {
      const field = object({
        name: string(),
      }).nullable();

      expect(field._config.nullable).toBe(true);
    });

    it('should support default()', () => {
      const defaultValue = { name: 'Default' };
      const field = object({
        name: string(),
      }).default(defaultValue);

      expect(field._config.defaultValue).toBe(defaultValue);
    });
  });

  describe('Nested Arrays', () => {
    it('should handle arrays within objects', () => {
      const field = object({
        name: string(),
        items: array(object({
          title: string(),
          quantity: number(),
        })),
      });

      type Inferred = InferFieldBuilderType<typeof field>;

      const test: Inferred = {
        name: 'Order',
        items: [
          { title: 'Item 1', quantity: 2 },
          { title: 'Item 2', quantity: 5 },
        ],
      };

      expect(test).toBeDefined();
    });
  });

  describe('Complex Nested Structures', () => {
    it('should handle deeply nested workflow structure', () => {
      const field = object({
        workflow: object({
          workflowRequired: array(object({
            taskName: string(),
            refDirectory: object({
              _id: string(),
              name: string().optional(),
              type: string().optional(),
            }),
          })),
          workflowOptional: array(object({
            taskName: string(),
            refDirectory: object({
              _id: string(),
              name: string().optional(),
            }),
          })),
        }),
      });

      type Inferred = InferFieldBuilderType<typeof field>;

      const test: Inferred = {
        workflow: {
          workflowRequired: [
            {
              taskName: 'Review',
              refDirectory: {
                _id: 'dir_123',
                name: 'Legal',
                type: 'department',
              },
            },
          ],
          workflowOptional: [
            {
              taskName: 'Optional Review',
              refDirectory: {
                _id: 'dir_456',
              },
            },
          ],
        },
      };

      expect(test).toBeDefined();
    });
  });
});
