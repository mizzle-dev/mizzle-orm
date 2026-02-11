/**
 * Type inference utilities for Standard Schema collections
 * These utilities derive Document, Insert, and Update types from a Standard Schema
 */

import type { ObjectId } from 'mongodb';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { InferSSInput, InferSSOutput } from './standard-schema';

/**
 * Helper type to check if a type has _id property
 */
type HasIdProperty<T> = T extends { _id: unknown } ? true : false;

/**
 * Infer the Document type from a Standard Schema
 * This is what you get when reading from the database
 *
 * - If the schema output already includes _id, it uses that type
 * - If _id is not defined, it adds _id: ObjectId automatically
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 * });
 *
 * type UserDoc = InferSSDocument<typeof userSchema>;
 * // { _id: ObjectId; email: string; name: string }
 * ```
 *
 * @example
 * ```typescript
 * // With custom _id type
 * const customSchema = z.object({
 *   _id: z.string(),
 *   name: z.string(),
 * });
 *
 * type CustomDoc = InferSSDocument<typeof customSchema>;
 * // { _id: string; name: string }
 * ```
 */
export type InferSSDocument<T extends StandardSchemaV1<any, any>> =
  HasIdProperty<InferSSOutput<T>> extends true
    ? InferSSOutput<T>
    : InferSSOutput<T> & { _id: ObjectId };

/**
 * Infer the Insert type from a Standard Schema
 * This is what you pass when creating a new document
 *
 * Uses the schema input type (before transforms) since that's
 * what the validation library expects to receive.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 *   role: z.enum(['user', 'admin']).default('user'),
 * });
 *
 * type UserInsert = InferSSInsert<typeof userSchema>;
 * // { email: string; name: string; role?: 'user' | 'admin' }
 * ```
 */
export type InferSSInsert<T extends StandardSchemaV1<any, any>> = InferSSInput<T>;

/**
 * Infer the Update type from a Standard Schema
 * This is what you can pass when updating a document
 *
 * - All fields are optional (partial updates)
 * - _id is excluded (you can't update _id)
 *
 * Uses the schema output type since updates should match
 * the stored document shape (after transforms).
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 *   role: z.enum(['user', 'admin']),
 * });
 *
 * type UserUpdate = InferSSUpdate<typeof userSchema>;
 * // { email?: string; name?: string; role?: 'user' | 'admin' }
 * ```
 */
export type InferSSUpdate<T extends StandardSchemaV1<any, any>> = Partial<
  Omit<InferSSDocument<T>, '_id'>
>;
