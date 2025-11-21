/**
 * Complex field builder implementations (array, record, union, object)
 */

import { FieldType } from '../types/field';
import type {
  AnyFieldBuilder,
  ArrayFieldBuilder as IArrayFieldBuilder,
  RecordFieldBuilder as IRecordFieldBuilder,
  UnionFieldBuilder as IUnionFieldBuilder,
  ObjectFieldBuilder as IObjectFieldBuilder,
  StringFieldBuilder,
  NumberFieldBuilder,
  InferFieldBuilderType,
  InferObjectType,
  SchemaDefinition,
} from '../types/field';
import type { FieldConfigState, EmptyConfig } from '../types/field-config';
import { FieldBuilder } from './field-builder-base';

/**
 * Array field builder
 */
export class ArrayFieldBuilder<
    TItem extends AnyFieldBuilder,
    TConfig extends FieldConfigState = EmptyConfig,
  >
  extends FieldBuilder<InferFieldBuilderType<TItem>[], TConfig, ArrayFieldBuilder<TItem, TConfig>>
  implements IArrayFieldBuilder<TItem, TConfig>
{
  readonly _item: TItem;

  constructor(itemField: TItem) {
    super(FieldType.ARRAY, {
      arrayConfig: {
        itemField: itemField._config,
      },
    });
    this._item = itemField;
  }

  min(length: number): ArrayFieldBuilder<TItem, TConfig> {
    this._config.arrayConfig = { ...this._config.arrayConfig, min: length };
    return this;
  }

  max(length: number): ArrayFieldBuilder<TItem, TConfig> {
    this._config.arrayConfig = { ...this._config.arrayConfig, max: length };
    return this;
  }

  /**
   * Override optional() to preserve _item property
   */
  optional(): ArrayFieldBuilder<TItem, TConfig & { optional: true }> {
    const result = new ArrayFieldBuilder<TItem, TConfig & { optional: true }>(this._item);
    result._config.optional = true;
    // Copy any other config properties
    Object.assign(result._config, this._config, { optional: true });
    return result;
  }

  /**
   * Override nullable() to preserve _item property
   */
  nullable(): ArrayFieldBuilder<TItem, TConfig & { nullable: true }> {
    const result = new ArrayFieldBuilder<TItem, TConfig & { nullable: true }>(this._item);
    result._config.nullable = true;
    // Copy any other config properties
    Object.assign(result._config, this._config, { nullable: true });
    return result;
  }
}

/**
 * Record/Map field builder
 */
export class RecordFieldBuilder<
    TKey extends StringFieldBuilder<any> | NumberFieldBuilder<any>,
    TValue extends AnyFieldBuilder,
    TConfig extends FieldConfigState = EmptyConfig,
  >
  extends FieldBuilder<
    Record<InferFieldBuilderType<TKey>, InferFieldBuilderType<TValue>>,
    TConfig,
    RecordFieldBuilder<TKey, TValue, TConfig>
  >
  implements IRecordFieldBuilder<TKey, TValue, TConfig>
{
  readonly _key: TKey;
  readonly _value: TValue;

  constructor(keyField: TKey, valueField: TValue) {
    super(FieldType.RECORD, {
      recordConfig: {
        keyField: keyField._config,
        valueField: valueField._config,
      },
    });
    this._key = keyField;
    this._value = valueField;
  }
}

/**
 * Union field builder
 */
export class UnionFieldBuilder<
    TVariants extends AnyFieldBuilder[],
    TConfig extends FieldConfigState = EmptyConfig,
  >
  extends FieldBuilder<
    InferFieldBuilderType<TVariants[number]>,
    TConfig,
    UnionFieldBuilder<TVariants, TConfig>
  >
  implements IUnionFieldBuilder<TVariants, TConfig>
{
  readonly _variants: TVariants;

  constructor(variants: TVariants) {
    super(FieldType.UNION, {
      unionConfig: {
        variants: variants.map((v) => v._config),
      },
    });
    this._variants = variants;
  }
}

/**
 * Object field builder (nested schema)
 */
export class ObjectFieldBuilder<
    TSchema extends SchemaDefinition,
    TConfig extends FieldConfigState = EmptyConfig,
  >
  extends FieldBuilder<InferObjectType<TSchema>, TConfig, ObjectFieldBuilder<TSchema, TConfig>>
  implements IObjectFieldBuilder<TSchema, TConfig>
{
  readonly _schema: TSchema;

  constructor(schema?: TSchema) {
    const objectConfig = schema
      ? {
          schema: Object.fromEntries(
            Object.entries(schema).map(([key, field]) => [key, field._config])
          ),
        }
      : undefined;

    super(FieldType.OBJECT, { objectConfig });
    this._schema = (schema || {}) as TSchema;
  }
}
