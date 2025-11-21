/**
 * Field factory functions - direct exports for schema definitions
 */

import type { AnyFieldBuilder } from '../types/field';
import {
  StringFieldBuilder,
  NumberFieldBuilder,
  BooleanFieldBuilder,
  DateFieldBuilder,
} from './field-builders-primitive';
import {
  ObjectIdFieldBuilder,
  PublicIdFieldBuilder,
  DecimalFieldBuilder,
  BinaryFieldBuilder,
  JsonFieldBuilder,
  GeoPointFieldBuilder,
} from './field-builders-mongo';
import {
  ArrayFieldBuilder,
  RecordFieldBuilder,
  UnionFieldBuilder,
  ObjectFieldBuilder,
} from './field-builders-complex';
import type {
  StringFieldBuilder as IStringFieldBuilder,
  NumberFieldBuilder as INumberFieldBuilder,
  SchemaDefinition,
} from '../types/field';

/**
 * Create a string field
 */
export function string(): StringFieldBuilder {
  return new StringFieldBuilder();
}

/**
 * Create a number field
 */
export function number(): NumberFieldBuilder {
  return new NumberFieldBuilder();
}

/**
 * Create a boolean field
 */
export function boolean(): BooleanFieldBuilder {
  return new BooleanFieldBuilder();
}

/**
 * Create a date field
 */
export function date(): DateFieldBuilder {
  return new DateFieldBuilder();
}

/**
 * Create an ObjectId field
 */
export function objectId(): ObjectIdFieldBuilder {
  return new ObjectIdFieldBuilder();
}

/**
 * Create a public ID field (prefixed ID)
 * @param prefix - The prefix for the ID (e.g., 'user' for 'user_abc123')
 */
export function publicId(prefix: string): PublicIdFieldBuilder {
  return new PublicIdFieldBuilder(prefix);
}

/**
 * Create a Decimal128 field
 */
export function decimal(): DecimalFieldBuilder {
  return new DecimalFieldBuilder();
}

/**
 * Create a Binary field
 */
export function binary(): BinaryFieldBuilder {
  return new BinaryFieldBuilder();
}

/**
 * Create a JSON field (arbitrary JSON data)
 */
export function json<T = unknown>(): JsonFieldBuilder<T> {
  return new JsonFieldBuilder<T>();
}

/**
 * Create a GeoPoint field (GeoJSON Point)
 */
export function geoPoint(): GeoPointFieldBuilder {
  return new GeoPointFieldBuilder();
}

/**
 * Create an array field
 */
export function array<T extends AnyFieldBuilder>(item: T): ArrayFieldBuilder<T> {
  return new ArrayFieldBuilder(item);
}

/**
 * Create a record/map field
 */
export function record<
  K extends IStringFieldBuilder<any> | INumberFieldBuilder<any>,
  V extends AnyFieldBuilder,
>(key: K, value: V): RecordFieldBuilder<K, V> {
  return new RecordFieldBuilder(key, value);
}

/**
 * Create a union field
 */
export function union<V extends AnyFieldBuilder[]>(...variants: V): UnionFieldBuilder<V> {
  return new UnionFieldBuilder(variants);
}

/**
 * Create an object field with nested schema
 *
 * @example
 * // Validated nested object
 * workflow: object({
 *   name: string(),
 *   items: array(object({ title: string() }))
 * })
 *
 * // Unvalidated flexible object
 * metadata: object()
 */
export function object<T extends SchemaDefinition>(schema?: T): ObjectFieldBuilder<T> {
  return new ObjectFieldBuilder(schema);
}
