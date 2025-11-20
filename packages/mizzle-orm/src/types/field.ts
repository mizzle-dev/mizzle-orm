/**
 * Core field type definitions and builder interfaces
 */

import type { ObjectId, Decimal128, Binary } from 'mongodb';
import type { FieldConfigState, EmptyConfig } from './field-config';
// import type { z } from 'zod'; // Will be used for validation later

/**
 * Runtime field types supported by Mizzle
 */
export enum FieldType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  OBJECT_ID = 'objectId',
  PUBLIC_ID = 'publicId',
  DECIMAL = 'decimal',
  BINARY = 'binary',
  JSON = 'json',
  GEO_POINT = 'geoPoint',
  ARRAY = 'array',
  RECORD = 'record',
  UNION = 'union',
}

/**
 * Index configuration for a field
 */
export interface IndexConfig {
  type?: 'asc' | 'desc' | 'text' | '2dsphere' | 'hashed';
  unique?: boolean;
  sparse?: boolean;
  ttl?: number; // seconds
  partialFilterExpression?: Record<string, unknown>;
  name?: string;
}

/**
 * Atlas Search configuration for a field
 */
export interface SearchConfig {
  type?: 'text' | 'autocomplete' | 'number' | 'date' | 'boolean';
  analyzer?: string;
  searchAnalyzer?: string;
  multi?: {
    [analyzerName: string]: {
      analyzer: string;
      type?: string;
    };
  };
}

/**
 * Audit/redaction configuration for a field
 */
export interface AuditConfig {
  redact?: 'omit' | 'mask' | 'hash';
  trackChanges?: boolean;
}

/**
 * Default value configuration
 */
export type DefaultValue<T> = T | (() => T) | (() => Promise<T>);

/**
 * Core field configuration metadata
 */
export interface FieldConfig<TType = unknown> {
  type: FieldType;
  optional: boolean;
  nullable: boolean;
  defaultValue?: DefaultValue<TType>;
  index?: IndexConfig;
  search?: SearchConfig;
  audit?: AuditConfig;

  // Special field markers
  isInternalId?: boolean; // _id field
  isPublicId?: boolean; // public ID field
  isTenantKey?: boolean;
  isOwnerKey?: boolean;
  isSoftDeleteFlag?: boolean;

  // Auto-update behavior
  defaultNow?: boolean; // Set to now() on insert
  onUpdateNow?: boolean; // Update to now() on update

  // Type-specific config
  stringConfig?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    email?: boolean;
    url?: boolean;
    uuid?: boolean;
  };

  numberConfig?: {
    min?: number;
    max?: number;
    int?: boolean;
    positive?: boolean;
  };

  arrayConfig?: {
    min?: number;
    max?: number;
    itemField?: FieldConfig;
  };

  recordConfig?: {
    keyField?: FieldConfig;
    valueField?: FieldConfig;
  };

  unionConfig?: {
    variants?: FieldConfig[];
  };

  publicIdConfig?: {
    prefix: string;
  };

  enumConfig?: {
    values: readonly string[];
  };
}

/**
 * Base field builder interface with chainable methods
 *
 * @template TType - The TypeScript type this field produces
 * @template TConfig - The type-level configuration state (NEW)
 * @template TSelf - The concrete builder type for method chaining
 *
 * The TConfig parameter encodes the field's configuration state at the type level,
 * allowing TypeScript to properly infer which fields are required for insert.
 */
export interface BaseFieldBuilder<TType, TConfig extends FieldConfigState, TSelf> {
  readonly _type: TType;
  readonly _configState: TConfig; // Type-level config (phantom type)
  readonly _config: FieldConfig<TType>; // Runtime config

  // Nullability
  optional(): BaseFieldBuilder<TType | undefined, TConfig & { optional: true }, TSelf>;
  nullable(): BaseFieldBuilder<TType | null, TConfig & { nullable: true }, TSelf>;

  // Default values
  default(value: DefaultValue<TType>): BaseFieldBuilder<TType, TConfig & { hasDefault: true }, TSelf>;

  // Indexing
  index(config?: Omit<IndexConfig, 'type'>): TSelf;
  unique(config?: Omit<IndexConfig, 'unique'>): TSelf;

  // Search
  search(config: SearchConfig): TSelf;

  // Audit
  audit(config: AuditConfig): TSelf;

  // Special markers
  tenantKey(): BaseFieldBuilder<TType, TConfig & { isTenantKey: true }, TSelf>;
  ownerKey(): BaseFieldBuilder<TType, TConfig & { isOwnerKey: true }, TSelf>;
  softDeleteFlag(): BaseFieldBuilder<TType, TConfig & { isSoftDeleteFlag: true }, TSelf>;
}

/**
 * String field builder
 */
export interface StringFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<string, TConfig, StringFieldBuilder<TConfig>> {
  min(length: number): StringFieldBuilder<TConfig>;
  max(length: number): StringFieldBuilder<TConfig>;
  length(length: number): StringFieldBuilder<TConfig>;
  pattern(regex: RegExp): StringFieldBuilder<TConfig>;
  email(): StringFieldBuilder<TConfig>;
  url(): StringFieldBuilder<TConfig>;
  uuid(): StringFieldBuilder<TConfig>;
  enum<T extends readonly string[]>(values: T): EnumFieldBuilder<T[number], TConfig>;
}

/**
 * Number field builder
 */
export interface NumberFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<number, TConfig, NumberFieldBuilder<TConfig>> {
  min(value: number): NumberFieldBuilder<TConfig>;
  max(value: number): NumberFieldBuilder<TConfig>;
  int(): NumberFieldBuilder<TConfig>;
  positive(): NumberFieldBuilder<TConfig>;
}

/**
 * Boolean field builder
 */
export interface BooleanFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<boolean, TConfig, BooleanFieldBuilder<TConfig>> {}

/**
 * Date field builder
 */
export interface DateFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<Date, TConfig, DateFieldBuilder<TConfig>> {
  defaultNow(): DateFieldBuilder<TConfig & { hasDefaultNow: true; hasDefault: true }>;
  onUpdateNow(): DateFieldBuilder<TConfig & { hasOnUpdateNow: true }>;
  min(date: Date): DateFieldBuilder<TConfig>;
  max(date: Date): DateFieldBuilder<TConfig>;
}

/**
 * ObjectId field builder
 */
export interface ObjectIdFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<ObjectId, TConfig, ObjectIdFieldBuilder<TConfig>> {
  internalId(): ObjectIdFieldBuilder<TConfig & { isInternalId: true }>;
}

/**
 * Public ID field builder (prefixed IDs)
 * By default, public IDs are auto-generated
 */
export interface PublicIdFieldBuilder<
  TConfig extends FieldConfigState = EmptyConfig & { isPublicId: true },
>
  extends BaseFieldBuilder<string, TConfig, PublicIdFieldBuilder<TConfig>> {
  readonly _prefix: string;
}

/**
 * Decimal field builder
 */
export interface DecimalFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<Decimal128, TConfig, DecimalFieldBuilder<TConfig>> {}

/**
 * Binary field builder
 */
export interface BinaryFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<Binary, TConfig, BinaryFieldBuilder<TConfig>> {}

/**
 * JSON field builder
 */
export interface JsonFieldBuilder<T = unknown, TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<T, TConfig, JsonFieldBuilder<T, TConfig>> {}

/**
 * GeoPoint field builder (GeoJSON Point)
 */
export interface GeoPointFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<
    { type: 'Point'; coordinates: [number, number] },
    TConfig,
    GeoPointFieldBuilder<TConfig>
  > {}

/**
 * Enum field builder
 */
export interface EnumFieldBuilder<T extends string, TConfig extends FieldConfigState = EmptyConfig>
  extends BaseFieldBuilder<T, TConfig, EnumFieldBuilder<T, TConfig>> {
  readonly _values: readonly T[];
}

/**
 * Array field builder
 */
export interface ArrayFieldBuilder<
  TItem extends AnyFieldBuilder,
  TConfig extends FieldConfigState = EmptyConfig,
>
  extends BaseFieldBuilder<
    InferFieldBuilderType<TItem>[],
    TConfig,
    ArrayFieldBuilder<TItem, TConfig>
  > {
  readonly _item: TItem;
  min(length: number): ArrayFieldBuilder<TItem, TConfig>;
  max(length: number): ArrayFieldBuilder<TItem, TConfig>;
}

/**
 * Record/Map field builder
 */
export interface RecordFieldBuilder<
  TKey extends StringFieldBuilder<any> | NumberFieldBuilder<any>,
  TValue extends AnyFieldBuilder,
  TConfig extends FieldConfigState = EmptyConfig,
>
  extends BaseFieldBuilder<
    Record<InferFieldBuilderType<TKey>, InferFieldBuilderType<TValue>>,
    TConfig,
    RecordFieldBuilder<TKey, TValue, TConfig>
  > {
  readonly _key: TKey;
  readonly _value: TValue;
}

/**
 * Union field builder
 */
export interface UnionFieldBuilder<
  TVariants extends AnyFieldBuilder[],
  TConfig extends FieldConfigState = EmptyConfig,
>
  extends BaseFieldBuilder<
    InferFieldBuilderType<TVariants[number]>,
    TConfig,
    UnionFieldBuilder<TVariants, TConfig>
  > {
  readonly _variants: TVariants;
}

/**
 * Any field builder type
 * Accepts any configuration state
 */
export type AnyFieldBuilder =
  | StringFieldBuilder<any>
  | NumberFieldBuilder<any>
  | BooleanFieldBuilder<any>
  | DateFieldBuilder<any>
  | ObjectIdFieldBuilder<any>
  | PublicIdFieldBuilder<any>
  | DecimalFieldBuilder<any>
  | BinaryFieldBuilder<any>
  | JsonFieldBuilder<any, any>
  | GeoPointFieldBuilder<any>
  | EnumFieldBuilder<string, any>
  | ArrayFieldBuilder<AnyFieldBuilder, any>
  | RecordFieldBuilder<StringFieldBuilder<any> | NumberFieldBuilder<any>, AnyFieldBuilder, any>
  | UnionFieldBuilder<AnyFieldBuilder[], any>;

/**
 * Infer the TypeScript type from a field builder
 */
export type InferFieldBuilderType<T> = T extends BaseFieldBuilder<infer TType, any> ? TType : never;

/**
 * Schema definition (map of field name to field builder)
 */
export type SchemaDefinition = Record<string, AnyFieldBuilder>;
