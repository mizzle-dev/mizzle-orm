/**
 * Zod-specific convenience wrapper for Standard Schema collections
 * Provides Zod-specific ergonomics like default extraction and better error formatting
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  fromStandardSchema,
  type SSCollectionDefinition,
  type SSCollectionOptions,
  type SSCollectionMeta,
} from './from-standard-schema';

/**
 * Type for a Zod schema (minimal interface we need)
 * This avoids a hard dependency on Zod types while ensuring we get a Zod schema
 */
interface ZodLike<TOutput = unknown> extends StandardSchemaV1<unknown, TOutput> {
  /**
   * Zod schemas have a _def property with schema definition
   * Zod 3.x uses `typeName`, Zod 4.x uses `type`
   */
  _def: {
    typeName?: string;
    type?: string;
    defaultValue?: unknown;
    innerType?: unknown;
    [key: string]: unknown;
  };

  /**
   * Zod's safeParse method for validation with better errors
   */
  safeParse: (data: unknown) => ZodSafeParseResult<TOutput>;

  /**
   * Zod's parse method (throws ZodError on failure)
   */
  parse: (data: unknown) => TOutput;

  /**
   * Zod object schemas have a shape property
   */
  shape?: Record<string, ZodLike>;
}

/**
 * Zod safeParse result type
 */
interface ZodSafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: ZodLikeError;
}

/**
 * Minimal ZodError interface
 */
interface ZodLikeError extends Error {
  issues: ZodIssue[];
  format: () => ZodFormattedError;
  flatten: () => ZodFlattenedError;
}

/**
 * Zod issue type
 */
interface ZodIssue {
  code: string;
  message: string;
  path: (string | number)[];
  [key: string]: unknown;
}

/**
 * Zod formatted error (nested structure)
 */
interface ZodFormattedError {
  _errors: string[];
  [key: string]: ZodFormattedError | string[];
}

/**
 * Zod flattened error
 */
interface ZodFlattenedError {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
}

/**
 * Extended metadata for Zod collections
 */
export interface ZodCollectionMeta<T extends ZodLike> extends SSCollectionMeta<T> {
  /**
   * The original Zod schema (for Zod-specific operations)
   */
  zodSchema: T;

  /**
   * Extracted default values from the Zod schema
   * Keys are field names, values are the default values or functions
   */
  defaults: Record<string, unknown>;

  /**
   * Whether this collection uses Zod (always true for fromZod collections)
   */
  isZod: true;
}

/**
 * Zod collection definition (extends SSCollectionDefinition with Zod-specific meta)
 */
export interface ZodCollectionDefinition<T extends ZodLike>
  extends Omit<SSCollectionDefinition<T>, '_meta'> {
  readonly _meta: ZodCollectionMeta<T>;
}

/**
 * Zod validation error with enhanced formatting
 * Provides Zod-specific error formatting methods
 */
export class ZodValidationError extends Error {
  /**
   * The original Zod error
   */
  public readonly zodError: ZodLikeError;

  /**
   * Standard Schema issues (for compatibility)
   */
  public readonly issues: readonly StandardSchemaV1.Issue[];

  constructor(zodError: ZodLikeError) {
    // Build a descriptive message using Zod's formatting
    const formatted = zodError.flatten();
    const fieldMessages = Object.entries(formatted.fieldErrors)
      .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
      .join('; ');
    const message = fieldMessages
      ? `Validation failed: ${fieldMessages}`
      : `Validation failed: ${zodError.message}`;

    super(message);
    this.name = 'ZodValidationError';
    this.zodError = zodError;

    // Convert Zod issues to Standard Schema issues for compatibility
    this.issues = zodError.issues.map((issue) => ({
      message: issue.message,
      path: issue.path,
    }));

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZodValidationError);
    }
  }

  /**
   * Get formatted errors (Zod's nested format)
   */
  format(): ZodFormattedError {
    return this.zodError.format();
  }

  /**
   * Get flattened errors (Zod's flat format)
   */
  flatten(): ZodFlattenedError {
    return this.zodError.flatten();
  }

  /**
   * Get errors for a specific field
   */
  getFieldErrors(field: string): string[] {
    const flattened = this.zodError.flatten();
    return flattened.fieldErrors[field] || [];
  }

  /**
   * Get all field names with errors
   */
  get errorFields(): string[] {
    const flattened = this.zodError.flatten();
    return Object.keys(flattened.fieldErrors);
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues,
      formatted: this.format(),
      flattened: this.flatten(),
    };
  }
}

/**
 * Extract default values from a Zod object schema
 *
 * Traverses the Zod schema definition to find fields with .default() applied
 * and extracts their default values.
 *
 * @param schema - A Zod object schema
 * @returns Record of field names to default values
 */
export function extractZodDefaults<T extends ZodLike>(
  schema: T,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  // Must be an object schema with shape
  if (!schema.shape) {
    return defaults;
  }

  for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
    const defaultValue = getZodDefaultValue(fieldSchema);
    if (defaultValue !== undefined) {
      defaults[fieldName] = defaultValue;
    }
  }

  return defaults;
}

/**
 * Get the default value from a Zod schema field
 * Handles both direct defaults and wrapped schemas (optional, nullable, etc.)
 * 
 * Supports both Zod 3.x (_def.typeName) and Zod 4.x (_def.type) structures
 */
function getZodDefaultValue(schema: ZodLike): unknown {
  const def = schema._def;

  // Zod 4.x: _def.type === 'default' with defaultValue
  if (def.type === 'default' && 'defaultValue' in def) {
    const defaultVal = def.defaultValue;
    // In Zod 4.x, defaultValue can be the actual value or a function
    return typeof defaultVal === 'function' ? defaultVal() : defaultVal;
  }

  // Zod 3.x: _def.typeName === 'ZodDefault' with defaultValue function
  if (def.typeName === 'ZodDefault' && 'defaultValue' in def) {
    const defaultFn = def.defaultValue as () => unknown;
    return typeof defaultFn === 'function' ? defaultFn() : defaultFn;
  }

  // Check inner schema for wrapped types (ZodOptional, ZodNullable, etc.)
  // Zod 4.x uses 'innerType' in def
  if ('innerType' in def && def.innerType) {
    return getZodDefaultValue(def.innerType as ZodLike);
  }

  // Zod 3.x uses 'innerType' in _def for some wrappers
  if (def.innerType) {
    return getZodDefaultValue(def.innerType as ZodLike);
  }

  return undefined;
}

/**
 * Apply Zod defaults to data before insertion
 *
 * @param data - The input data
 * @param defaults - The extracted defaults from the schema
 * @returns Data with defaults applied for missing/undefined fields
 */
export function applyZodDefaults<T extends Record<string, unknown>>(
  data: T,
  defaults: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...data };

  for (const [field, defaultValue] of Object.entries(defaults)) {
    if (!(field in result) || result[field] === undefined) {
      result[field] = defaultValue;
    }
  }

  return result as T;
}

/**
 * Validate data using Zod schema and throw ZodValidationError on failure
 *
 * @param schema - The Zod schema
 * @param data - Data to validate
 * @param options - Validation options
 * @throws ZodValidationError if validation fails
 * @returns The parsed data (with defaults and transforms applied)
 */
export function validateWithZod<T extends ZodLike>(
  schema: T,
  data: unknown,
  options: { partial?: boolean } = {},
): StandardSchemaV1.InferOutput<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const error = result.error!;

    if (options.partial && typeof data === 'object' && data !== null) {
      // For partial validation, filter issues to only fields in the update
      const updateKeys = new Set(Object.keys(data as object));
      const relevantIssues = error.issues.filter((issue) => {
        if (!issue.path || issue.path.length === 0) return false;
        return updateKeys.has(String(issue.path[0]));
      });

      if (relevantIssues.length === 0) {
        // No relevant issues for fields we're updating
        return data as any;
      }

      // Create a new error with only relevant issues
      const filteredError = {
        ...error,
        issues: relevantIssues,
        format: () => {
          const formatted: ZodFormattedError = { _errors: [] };
          for (const issue of relevantIssues) {
            if (issue.path.length > 0) {
              const field = String(issue.path[0]);
              if (!formatted[field]) {
                formatted[field] = { _errors: [] };
              }
              (formatted[field] as ZodFormattedError)._errors.push(issue.message);
            }
          }
          return formatted;
        },
        flatten: () => {
          const fieldErrors: Record<string, string[]> = {};
          for (const issue of relevantIssues) {
            if (issue.path.length > 0) {
              const field = String(issue.path[0]);
              if (!fieldErrors[field]) {
                fieldErrors[field] = [];
              }
              fieldErrors[field].push(issue.message);
            }
          }
          return { formErrors: [], fieldErrors };
        },
      };

      throw new ZodValidationError(filteredError as ZodLikeError);
    }

    throw new ZodValidationError(error);
  }

  return result.data as StandardSchemaV1.InferOutput<T>;
}

/**
 * Create a collection definition from a Zod schema
 *
 * This is a convenience wrapper around `fromStandardSchema` that provides
 * Zod-specific ergonomics:
 *
 * 1. **Default extraction**: Automatically extracts `.default()` values from
 *    the Zod schema and applies them on insert
 * 2. **Better errors**: Uses Zod's error formatting for detailed validation errors
 * 3. **Full Zod support**: Preserves access to the original Zod schema for
 *    advanced use cases
 *
 * @param name - The MongoDB collection name
 * @param schema - A Zod object schema
 * @param options - Collection options (publicId, softDelete, timestamps, etc.)
 * @returns A collection definition with Zod-specific features
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { fromZod } from '@mizzle-dev/orm';
 *
 * const userSchema = z.object({
 *   email: z.string().email(),
 *   name: z.string().min(1),
 *   role: z.enum(['user', 'admin']).default('user'),
 *   settings: z.object({
 *     theme: z.enum(['light', 'dark']).default('light'),
 *     notifications: z.boolean().default(true),
 *   }).default({}),
 * });
 *
 * const users = fromZod('users', userSchema, {
 *   publicId: 'user',
 *   softDelete: true,
 * });
 *
 * // Defaults are automatically applied on insert:
 * // { email: 'test@example.com', name: 'Test' }
 * // becomes:
 * // { email: 'test@example.com', name: 'Test', role: 'user', settings: { theme: 'light', notifications: true } }
 *
 * // Validation errors include Zod formatting:
 * try {
 *   await db.users.create({ email: 'invalid', name: '' });
 * } catch (error) {
 *   if (error instanceof ZodValidationError) {
 *     console.log(error.flatten());
 *     // { formErrors: [], fieldErrors: { email: ['Invalid email'], name: ['String must contain at least 1 character(s)'] } }
 *   }
 * }
 * ```
 */
export function fromZod<T extends ZodLike>(
  name: string,
  schema: T,
  options: SSCollectionOptions = {},
): ZodCollectionDefinition<T> {
  // Validate that it's a Zod schema
  if (!isZodSchema(schema)) {
    throw new Error(
      `Schema passed to fromZod must be a Zod schema. ` +
        `Expected an object with '_def' and 'safeParse'. ` +
        `For other Standard Schema libraries, use fromStandardSchema instead.`,
    );
  }

  // Extract defaults from the Zod schema
  const defaults = extractZodDefaults(schema);

  // Create base collection using fromStandardSchema
  const baseCollection = fromStandardSchema(name, schema, options);

  // Extend metadata with Zod-specific info
  const zodMeta: ZodCollectionMeta<T> = {
    ...baseCollection._meta,
    zodSchema: schema,
    defaults,
    isZod: true,
  };

  // Return extended collection definition
  const zodCollection: ZodCollectionDefinition<T> = {
    ...baseCollection,
    _meta: zodMeta,
  };

  return zodCollection;
}

/**
 * Type guard to check if a schema is a Zod schema
 */
export function isZodSchema(value: unknown): value is ZodLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    'safeParse' in value &&
    typeof (value as any).safeParse === 'function'
  );
}

/**
 * Type guard to check if a collection definition is a Zod collection
 */
export function isZodCollectionDefinition(
  value: unknown,
): value is ZodCollectionDefinition<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any)._brand === 'SSCollectionDefinition' &&
    (value as any)._meta?.isZod === true
  );
}
