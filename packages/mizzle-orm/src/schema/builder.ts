/**
 * Schema builder - main entry point for defining field schemas
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
import { ArrayFieldBuilder, RecordFieldBuilder, UnionFieldBuilder } from './field-builders-complex';
import type {
  StringFieldBuilder as IStringFieldBuilder,
  NumberFieldBuilder as INumberFieldBuilder,
} from '../types/field';

/**
 * Schema builder - provides factory methods for all field types
 */
export class SchemaBuilder {
  /**
   * Create a string field
   */
  string(): StringFieldBuilder {
    return new StringFieldBuilder();
  }

  /**
   * Create a number field
   */
  number(): NumberFieldBuilder {
    return new NumberFieldBuilder();
  }

  /**
   * Create a boolean field
   */
  boolean(): BooleanFieldBuilder {
    return new BooleanFieldBuilder();
  }

  /**
   * Create a date field
   */
  date(): DateFieldBuilder {
    return new DateFieldBuilder();
  }

  /**
   * Create an ObjectId field
   */
  objectId(): ObjectIdFieldBuilder {
    return new ObjectIdFieldBuilder();
  }

  /**
   * Create a public ID field (prefixed ID)
   * @param prefix - The prefix for the ID (e.g., 'user' for 'user_abc123')
   */
  publicId(prefix: string): PublicIdFieldBuilder {
    return new PublicIdFieldBuilder(prefix);
  }

  /**
   * Create a Decimal128 field
   */
  decimal(): DecimalFieldBuilder {
    return new DecimalFieldBuilder();
  }

  /**
   * Create a Binary field
   */
  binary(): BinaryFieldBuilder {
    return new BinaryFieldBuilder();
  }

  /**
   * Create a JSON field (arbitrary JSON data)
   */
  json<T = unknown>(): JsonFieldBuilder<T> {
    return new JsonFieldBuilder<T>();
  }

  /**
   * Create a GeoPoint field (GeoJSON Point)
   */
  geoPoint(): GeoPointFieldBuilder {
    return new GeoPointFieldBuilder();
  }

  /**
   * Create an array field
   */
  array<T extends AnyFieldBuilder>(item: T): ArrayFieldBuilder<T> {
    return new ArrayFieldBuilder(item);
  }

  /**
   * Create a record/map field
   */
  record<K extends IStringFieldBuilder | INumberFieldBuilder, V extends AnyFieldBuilder>(
    key: K,
    value: V,
  ): RecordFieldBuilder<K, V> {
    return new RecordFieldBuilder(key, value);
  }

  /**
   * Create a union field
   */
  union<V extends AnyFieldBuilder[]>(...variants: V): UnionFieldBuilder<V> {
    return new UnionFieldBuilder(variants);
  }
}

/**
 * Create a schema builder instance
 */
export function createSchemaBuilder(): SchemaBuilder {
  return new SchemaBuilder();
}
