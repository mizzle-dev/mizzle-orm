/**
 * Standard Schema collection factory
 * Creates collection definitions from Standard Schema-compliant validation libraries (Zod, Valibot, ArkType)
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Middleware } from '../types/middleware';
import type { InferSSDocument, InferSSInsert, InferSSUpdate } from '../types/standard-schema-inference';

/**
 * Normalized public ID configuration
 */
export interface SSPublicIdConfig {
  /**
   * Prefix for the public ID (e.g., 'user' → 'user_abc123')
   */
  prefix: string;

  /**
   * Field name to store the public ID (default: 'id')
   */
  field: string;
}

/**
 * Options for Standard Schema collections
 * Simplified options compared to field-builder collections since the schema handles validation
 */
export interface SSCollectionOptions {
  /**
   * Public ID configuration
   * Can be a prefix string (uses 'id' as field name) or full config object
   * @example 'user' → prefix 'user', field 'id' → 'user_abc123'
   * @example { prefix: 'user', field: 'publicId' } → stores in 'publicId' field
   */
  publicId?: string | { prefix: string; field?: string };

  /**
   * Enable soft delete (adds deletedAt field)
   */
  softDelete?: boolean;

  /**
   * Enable timestamps (adds createdAt, updatedAt fields)
   */
  timestamps?: boolean;

  /**
   * Custom middlewares for this collection
   */
  middlewares?: Middleware[];
}

/**
 * Metadata for Standard Schema collections
 */
export interface SSCollectionMeta<T extends StandardSchemaV1<any, any>> {
  /**
   * Collection name in MongoDB
   */
  name: string;

  /**
   * The Standard Schema used for validation
   */
  schema: T;

  /**
   * Collection options
   */
  options: SSCollectionOptions;

  /**
   * Normalized public ID configuration (if publicId option was specified)
   */
  publicIdConfig?: SSPublicIdConfig;

  /**
   * Middlewares applied to this collection
   */
  middlewares: Middleware[];
}

/**
 * Collection definition for Standard Schema-based collections
 * 
 * This mirrors the CollectionDefinition interface but uses Standard Schema
 * types for inference instead of field builders.
 * 
 * @template T - The Standard Schema type (must be StandardSchemaV1 compliant)
 * 
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { fromStandardSchema } from '@mizzle-dev/orm';
 * 
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 *   role: z.enum(['user', 'admin']).default('user'),
 * });
 * 
 * const users = fromStandardSchema('users', userSchema, {
 *   publicId: 'user',
 *   softDelete: true,
 * });
 * 
 * // Type inference works automatically
 * type UserDoc = typeof users.$inferDocument;
 * // { _id: ObjectId; email: string; name: string; role: 'user' | 'admin' }
 * ```
 */
export interface SSCollectionDefinition<T extends StandardSchemaV1<any, any>> {
  /**
   * The Standard Schema used for validation
   * Stored for runtime access (validation on insert/update)
   */
  readonly _schema: T;

  /**
   * Collection metadata
   */
  readonly _meta: SSCollectionMeta<T>;

  /**
   * Brand to distinguish from regular CollectionDefinition
   */
  readonly _brand: 'SSCollectionDefinition';

  /**
   * Infer the Document type (what you get from the database)
   * Includes _id: ObjectId unless the schema defines _id
   */
  readonly $inferDocument: InferSSDocument<T>;

  /**
   * Infer the Insert type (what you pass to create a document)
   * Uses schema input type (before transforms, respects optional/defaults)
   */
  readonly $inferInsert: InferSSInsert<T>;

  /**
   * Infer the Update type (what you pass to update a document)
   * Partial of Document without _id
   */
  readonly $inferUpdate: InferSSUpdate<T>;
}

/**
 * Create a collection definition from a Standard Schema-compliant schema
 * 
 * This is the primary way to define collections using validation libraries
 * like Zod, Valibot, or ArkType instead of Mizzle's field builders.
 * 
 * @param name - The MongoDB collection name
 * @param schema - Any Standard Schema-compliant schema (Zod, Valibot, ArkType, etc.)
 * @param options - Optional collection configuration
 * @returns A collection definition with full type inference
 * 
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { fromStandardSchema } from '@mizzle-dev/orm';
 * 
 * // Define schema with Zod
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string(),
 *   role: z.enum(['user', 'admin']).default('user'),
 * });
 * 
 * // Create collection definition
 * const users = fromStandardSchema('users', userSchema, {
 *   publicId: 'user',
 *   softDelete: true,
 *   timestamps: true,
 * });
 * 
 * // Type helpers are available
 * type UserDoc = typeof users.$inferDocument;
 * type UserInsert = typeof users.$inferInsert;
 * type UserUpdate = typeof users.$inferUpdate;
 * ```
 * 
 * @example
 * ```typescript
 * // Works with transforms
 * const postSchema = z.object({
 *   title: z.string(),
 *   slug: z.string().transform(s => s.toLowerCase().replace(/\s+/g, '-')),
 *   views: z.number().default(0),
 * });
 * 
 * const posts = fromStandardSchema('posts', postSchema);
 * 
 * // Insert type has original string for slug
 * type PostInsert = typeof posts.$inferInsert;
 * // { title: string; slug: string; views?: number }
 * 
 * // Document type has transformed slug
 * type PostDoc = typeof posts.$inferDocument;
 * // { _id: ObjectId; title: string; slug: string; views: number }
 * ```
 */
export function fromStandardSchema<T extends StandardSchemaV1<any, any>>(
  name: string,
  schema: T,
  options: SSCollectionOptions = {},
): SSCollectionDefinition<T> {
  // Validate that the schema is Standard Schema compliant
  if (!isStandardSchema(schema)) {
    throw new Error(
      `Schema passed to fromStandardSchema must be Standard Schema compliant. ` +
      `Expected an object with '~standard' property containing version, vendor, and validate.`
    );
  }

  // Normalize publicId config
  let publicIdConfig: SSPublicIdConfig | undefined;
  if (options.publicId) {
    if (typeof options.publicId === 'string') {
      publicIdConfig = {
        prefix: options.publicId,
        field: 'id', // Default field name
      };
    } else {
      publicIdConfig = {
        prefix: options.publicId.prefix,
        field: options.publicId.field || 'id', // Default field name if not specified
      };
    }
  }

  // Build metadata
  const meta: SSCollectionMeta<T> = {
    name,
    schema,
    options,
    publicIdConfig,
    middlewares: options.middlewares || [],
  };

  // Create collection definition
  // The type helpers ($inferDocument, etc.) are phantom types - they exist only at compile time
  const definition: SSCollectionDefinition<T> = {
    _schema: schema,
    _meta: meta,
    _brand: 'SSCollectionDefinition',
    // These are phantom types for inference, never accessed at runtime
    $inferDocument: null as any,
    $inferInsert: null as any,
    $inferUpdate: null as any,
  };

  return definition;
}

/**
 * Runtime check for Standard Schema compliance
 * Verifies the schema has the required ~standard interface
 */
function isStandardSchema(value: unknown): value is StandardSchemaV1<any, any> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const standard = (value as any)['~standard'];
  if (typeof standard !== 'object' || standard === null) {
    return false;
  }

  return (
    typeof standard.version === 'number' &&
    typeof standard.vendor === 'string' &&
    typeof standard.validate === 'function'
  );
}

/**
 * Type guard to check if a collection definition is a Standard Schema collection
 */
export function isSSCollectionDefinition(
  value: unknown,
): value is SSCollectionDefinition<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any)._brand === 'SSCollectionDefinition'
  );
}

/**
 * Extract the Document type from an SSCollectionDefinition
 */
export type ExtractSSDocument<T extends SSCollectionDefinition<any>> = T['$inferDocument'];

/**
 * Extract the Insert type from an SSCollectionDefinition
 */
export type ExtractSSInsert<T extends SSCollectionDefinition<any>> = T['$inferInsert'];

/**
 * Extract the Update type from an SSCollectionDefinition
 */
export type ExtractSSUpdate<T extends SSCollectionDefinition<any>> = T['$inferUpdate'];
