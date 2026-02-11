/**
 * Standard Schema type utility tests
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { IsStandardSchema, InferSSInput, InferSSOutput } from '../standard-schema';

// Type assertion helper - compilation will fail if types don't match
type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
type Assert<T extends true> = T;

describe('Standard Schema Type Utilities', () => {
  describe('IsStandardSchema', () => {
    it('should return true for Zod schemas', () => {
      const zodString = z.string();
      const zodObject = z.object({ name: z.string() });

      // Runtime check that Zod implements Standard Schema
      expect((zodString as any)['~standard']).toBeDefined();
      expect((zodObject as any)['~standard']).toBeDefined();

      // Type-level checks
      type StringIsSSPasses = Assert<AssertEqual<IsStandardSchema<typeof zodString>, true>>;
      type ObjectIsSSPasses = Assert<AssertEqual<IsStandardSchema<typeof zodObject>, true>>;

      // Verify types compile (these are compile-time checks)
      const _strCheck: StringIsSSPasses = true;
      const _objCheck: ObjectIsSSPasses = true;
      expect(_strCheck).toBe(true);
      expect(_objCheck).toBe(true);
    });

    it('should return false for non-Standard Schema values', () => {
      // Plain object
      type PlainObj = { foo: string };
      type PlainObjNotSS = Assert<AssertEqual<IsStandardSchema<PlainObj>, false>>;
      const _plainCheck: PlainObjNotSS = true;
      expect(_plainCheck).toBe(true);

      // Primitives
      type StringPrimitive = string;
      type StringNotSS = Assert<AssertEqual<IsStandardSchema<StringPrimitive>, false>>;
      const _stringCheck: StringNotSS = true;
      expect(_stringCheck).toBe(true);

      // Function
      type FuncType = () => void;
      type FuncNotSS = Assert<AssertEqual<IsStandardSchema<FuncType>, false>>;
      const _funcCheck: FuncNotSS = true;
      expect(_funcCheck).toBe(true);
    });
  });

  describe('InferSSInput', () => {
    it('should extract input type from Zod string schema', () => {
      const schema = z.string();
      type Input = InferSSInput<typeof schema>;
      type InputIsString = Assert<AssertEqual<Input, string>>;
      const _check: InputIsString = true;
      expect(_check).toBe(true);
    });

    it('should extract input type from Zod number schema', () => {
      const schema = z.number();
      type Input = InferSSInput<typeof schema>;
      type InputIsNumber = Assert<AssertEqual<Input, number>>;
      const _check: InputIsNumber = true;
      expect(_check).toBe(true);
    });

    it('should extract input type from Zod object schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
      });

      type Input = InferSSInput<typeof schema>;

      // Check specific fields
      type NameIsString = Assert<AssertEqual<Input['name'], string>>;
      type AgeIsNumber = Assert<AssertEqual<Input['age'], number>>;
      type ActiveIsBool = Assert<AssertEqual<Input['active'], boolean>>;

      const _nameCheck: NameIsString = true;
      const _ageCheck: AgeIsNumber = true;
      const _activeCheck: ActiveIsBool = true;

      expect(_nameCheck).toBe(true);
      expect(_ageCheck).toBe(true);
      expect(_activeCheck).toBe(true);
    });

    it('should extract input type from Zod array schema', () => {
      const schema = z.array(z.string());
      type Input = InferSSInput<typeof schema>;
      type InputIsStringArray = Assert<AssertEqual<Input, string[]>>;
      const _check: InputIsStringArray = true;
      expect(_check).toBe(true);
    });

    it('should return never for non-Standard Schema types', () => {
      type Input = InferSSInput<{ notASchema: true }>;
      type InputIsNever = Assert<AssertEqual<Input, never>>;
      const _check: InputIsNever = true;
      expect(_check).toBe(true);
    });
  });

  describe('InferSSOutput', () => {
    it('should extract output type from simple Zod schema', () => {
      const schema = z.string();
      type Output = InferSSOutput<typeof schema>;
      type OutputIsString = Assert<AssertEqual<Output, string>>;
      const _check: OutputIsString = true;
      expect(_check).toBe(true);
    });

    it('should handle Zod transform (output differs from input)', () => {
      const schema = z.string().transform((s) => s.length);
      type Input = InferSSInput<typeof schema>;
      type Output = InferSSOutput<typeof schema>;

      // Input is string
      type InputIsString = Assert<AssertEqual<Input, string>>;
      const _inputCheck: InputIsString = true;
      expect(_inputCheck).toBe(true);

      // Output is number (transformed)
      type OutputIsNumber = Assert<AssertEqual<Output, number>>;
      const _outputCheck: OutputIsNumber = true;
      expect(_outputCheck).toBe(true);
    });

    it('should extract output type from Zod object schema', () => {
      const schema = z.object({
        email: z.string().email(),
        count: z.number().int(),
      });

      type Output = InferSSOutput<typeof schema>;

      type EmailIsString = Assert<AssertEqual<Output['email'], string>>;
      type CountIsNumber = Assert<AssertEqual<Output['count'], number>>;

      const _emailCheck: EmailIsString = true;
      const _countCheck: CountIsNumber = true;

      expect(_emailCheck).toBe(true);
      expect(_countCheck).toBe(true);
    });

    it('should handle Zod optional fields', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      type Output = InferSSOutput<typeof schema>;

      // Required field is just string
      type RequiredIsString = Assert<AssertEqual<Output['required'], string>>;
      const _reqCheck: RequiredIsString = true;
      expect(_reqCheck).toBe(true);

      // Optional field is string | undefined
      type OptionalIsStringOrUndef = Assert<AssertEqual<Output['optional'], string | undefined>>;
      const _optCheck: OptionalIsStringOrUndef = true;
      expect(_optCheck).toBe(true);
    });

    it('should return never for non-Standard Schema types', () => {
      type Output = InferSSOutput<{ notASchema: true }>;
      type OutputIsNever = Assert<AssertEqual<Output, never>>;
      const _check: OutputIsNever = true;
      expect(_check).toBe(true);
    });
  });

  describe('Standard Schema runtime compliance', () => {
    it('should verify Zod implements ~standard interface', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      // Check runtime Standard Schema interface
      const ssInterface = (schema as any)['~standard'];
      expect(ssInterface).toBeDefined();
      expect(ssInterface.version).toBe(1);
      expect(typeof ssInterface.vendor).toBe('string');
      expect(typeof ssInterface.validate).toBe('function');
    });

    it('should use Standard Schema validate for runtime validation', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const ssInterface = (schema as any)['~standard'] as StandardSchemaV1<any, any>['~standard'];

      // Valid input
      const validResult = ssInterface.validate({ name: 'Alice', age: 30 });

      // Handle both sync and async results
      const resolvedValid = validResult instanceof Promise ? await validResult : validResult;
      expect(resolvedValid.issues).toBeUndefined();
      expect(resolvedValid.value).toEqual({ name: 'Alice', age: 30 });

      // Invalid input
      const invalidResult = ssInterface.validate({ name: 123, age: 'thirty' });
      const resolvedInvalid = invalidResult instanceof Promise ? await invalidResult : invalidResult;
      expect(resolvedInvalid.issues).toBeDefined();
      expect(resolvedInvalid.issues!.length).toBeGreaterThan(0);
    });
  });

  describe('vitest expectTypeOf assertions', () => {
    it('should verify IsStandardSchema with expectTypeOf', () => {
      const zodSchema = z.string();
      expectTypeOf<IsStandardSchema<typeof zodSchema>>().toEqualTypeOf<true>();
      expectTypeOf<IsStandardSchema<{ plain: 'object' }>>().toEqualTypeOf<false>();
    });

    it('should verify InferSSInput with expectTypeOf', () => {
      const schema = z.object({
        id: z.string(),
        count: z.number(),
      });

      expectTypeOf<InferSSInput<typeof schema>>().toEqualTypeOf<{
        id: string;
        count: number;
      }>();
    });

    it('should verify InferSSOutput with expectTypeOf', () => {
      const schema = z.string().transform((s) => parseInt(s, 10));

      expectTypeOf<InferSSInput<typeof schema>>().toEqualTypeOf<string>();
      expectTypeOf<InferSSOutput<typeof schema>>().toEqualTypeOf<number>();
    });
  });
});
