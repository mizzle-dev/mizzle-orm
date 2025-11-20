/**
 * Core field type definitions and builder interfaces
 */

import type { ObjectId, Decimal128, Binary } from 'mongodb';
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
 */
export interface BaseFieldBuilder<TType, TSelf> {
  readonly _type: TType;
  readonly _config: FieldConfig<TType>;

  // Nullability
  optional(): BaseFieldBuilder<TType | undefined, TSelf>;
  nullable(): BaseFieldBuilder<TType | null, TSelf>;

  // Default values
  default(value: DefaultValue<TType>): TSelf;

  // Indexing
  index(config?: Omit<IndexConfig, 'type'>): TSelf;
  unique(config?: Omit<IndexConfig, 'unique'>): TSelf;

  // Search
  search(config: SearchConfig): TSelf;

  // Audit
  audit(config: AuditConfig): TSelf;

  // Special markers
  tenantKey(): TSelf;
  ownerKey(): TSelf;
  softDeleteFlag(): TSelf;
}

/**
 * String field builder
 */
export interface StringFieldBuilder extends BaseFieldBuilder<string, StringFieldBuilder> {
  min(length: number): StringFieldBuilder;
  max(length: number): StringFieldBuilder;
  length(length: number): StringFieldBuilder;
  pattern(regex: RegExp): StringFieldBuilder;
  email(): StringFieldBuilder;
  url(): StringFieldBuilder;
  uuid(): StringFieldBuilder;
  enum<T extends readonly string[]>(values: T): EnumFieldBuilder<T[number]>;
}

/**
 * Number field builder
 */
export interface NumberFieldBuilder extends BaseFieldBuilder<number, NumberFieldBuilder> {
  min(value: number): NumberFieldBuilder;
  max(value: number): NumberFieldBuilder;
  int(): NumberFieldBuilder;
  positive(): NumberFieldBuilder;
}

/**
 * Boolean field builder
 */
export interface BooleanFieldBuilder extends BaseFieldBuilder<boolean, BooleanFieldBuilder> {}

/**
 * Date field builder
 */
export interface DateFieldBuilder extends BaseFieldBuilder<Date, DateFieldBuilder> {
  defaultNow(): DateFieldBuilder;
  onUpdateNow(): DateFieldBuilder;
  min(date: Date): DateFieldBuilder;
  max(date: Date): DateFieldBuilder;
}

/**
 * ObjectId field builder
 */
export interface ObjectIdFieldBuilder extends BaseFieldBuilder<ObjectId, ObjectIdFieldBuilder> {
  internalId(): ObjectIdFieldBuilder;
}

/**
 * Public ID field builder (prefixed IDs)
 */
export interface PublicIdFieldBuilder extends BaseFieldBuilder<string, PublicIdFieldBuilder> {
  readonly _prefix: string;
}

/**
 * Decimal field builder
 */
export interface DecimalFieldBuilder extends BaseFieldBuilder<Decimal128, DecimalFieldBuilder> {}

/**
 * Binary field builder
 */
export interface BinaryFieldBuilder extends BaseFieldBuilder<Binary, BinaryFieldBuilder> {}

/**
 * JSON field builder
 */
export interface JsonFieldBuilder<T = unknown> extends BaseFieldBuilder<T, JsonFieldBuilder<T>> {}

/**
 * GeoPoint field builder (GeoJSON Point)
 */
export interface GeoPointFieldBuilder
  extends BaseFieldBuilder<
    { type: 'Point'; coordinates: [number, number] },
    GeoPointFieldBuilder
  > {}

/**
 * Enum field builder
 */
export interface EnumFieldBuilder<T extends string>
  extends BaseFieldBuilder<T, EnumFieldBuilder<T>> {
  readonly _values: readonly T[];
}

/**
 * Array field builder
 */
export interface ArrayFieldBuilder<TItem extends AnyFieldBuilder>
  extends BaseFieldBuilder<InferFieldBuilderType<TItem>[], ArrayFieldBuilder<TItem>> {
  readonly _item: TItem;
  min(length: number): ArrayFieldBuilder<TItem>;
  max(length: number): ArrayFieldBuilder<TItem>;
}

/**
 * Record/Map field builder
 */
export interface RecordFieldBuilder<
  TKey extends StringFieldBuilder | NumberFieldBuilder,
  TValue extends AnyFieldBuilder,
> extends BaseFieldBuilder<
    Record<InferFieldBuilderType<TKey>, InferFieldBuilderType<TValue>>,
    RecordFieldBuilder<TKey, TValue>
  > {
  readonly _key: TKey;
  readonly _value: TValue;
}

/**
 * Union field builder
 */
export interface UnionFieldBuilder<TVariants extends AnyFieldBuilder[]>
  extends BaseFieldBuilder<InferFieldBuilderType<TVariants[number]>, UnionFieldBuilder<TVariants>> {
  readonly _variants: TVariants;
}

/**
 * Any field builder type
 */
export type AnyFieldBuilder =
  | StringFieldBuilder
  | NumberFieldBuilder
  | BooleanFieldBuilder
  | DateFieldBuilder
  | ObjectIdFieldBuilder
  | PublicIdFieldBuilder
  | DecimalFieldBuilder
  | BinaryFieldBuilder
  | JsonFieldBuilder
  | GeoPointFieldBuilder
  | EnumFieldBuilder<string>
  | ArrayFieldBuilder<AnyFieldBuilder>
  | RecordFieldBuilder<StringFieldBuilder | NumberFieldBuilder, AnyFieldBuilder>
  | UnionFieldBuilder<AnyFieldBuilder[]>;

/**
 * Infer the TypeScript type from a field builder
 */
export type InferFieldBuilderType<T> = T extends BaseFieldBuilder<infer TType, any> ? TType : never;

/**
 * Schema definition (map of field name to field builder)
 */
export type SchemaDefinition = Record<string, AnyFieldBuilder>;
