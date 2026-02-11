/**
 * Standard Schema type utilities for Mizzle ORM
 * Enables integration with any Standard Schema-compliant validation library (Zod, Valibot, ArkType)
 * @see https://standardschema.dev/
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

// Re-export the core Standard Schema interface
export type { StandardSchemaV1 };

/**
 * Type guard to check if a value conforms to the Standard Schema interface
 * A valid Standard Schema must have:
 * - ~standard.version property (1 for StandardSchemaV1)
 * - ~standard.vendor property (string identifying the library)
 * - ~standard.validate method for validation
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.string();
 * type Test = IsStandardSchema<typeof schema>; // true
 *
 * const notSchema = { foo: 'bar' };
 * type Test2 = IsStandardSchema<typeof notSchema>; // false
 * ```
 */
export type IsStandardSchema<T> = T extends StandardSchemaV1<any, any> ? true : false;

/**
 * Extract the input type from a Standard Schema
 * This is the type that the schema accepts for validation
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * type UserInput = InferSSInput<typeof userSchema>;
 * // { name: string; age: number }
 * ```
 */
export type InferSSInput<T> = T extends StandardSchemaV1<infer TInput, any> ? TInput : never;

/**
 * Extract the output type from a Standard Schema
 * This is the type returned after successful validation
 * May differ from input type due to transformations or defaults
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const schema = z.string().transform(s => s.length);
 *
 * type Input = InferSSInput<typeof schema>; // string
 * type Output = InferSSOutput<typeof schema>; // number
 * ```
 */
export type InferSSOutput<T> = T extends StandardSchemaV1<any, infer TOutput> ? TOutput : never;
