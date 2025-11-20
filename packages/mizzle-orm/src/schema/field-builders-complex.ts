/**
 * Complex field builder implementations (array, record, union)
 */

import { FieldType } from '../types/field';
import type {
  AnyFieldBuilder,
  ArrayFieldBuilder as IArrayFieldBuilder,
  RecordFieldBuilder as IRecordFieldBuilder,
  UnionFieldBuilder as IUnionFieldBuilder,
  StringFieldBuilder,
  NumberFieldBuilder,
  InferFieldBuilderType,
} from '../types/field';
import { FieldBuilder } from './field-builder-base';

/**
 * Array field builder
 */
export class ArrayFieldBuilder<TItem extends AnyFieldBuilder>
  extends FieldBuilder<InferFieldBuilderType<TItem>[], ArrayFieldBuilder<TItem>>
  implements IArrayFieldBuilder<TItem>
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

  min(length: number): ArrayFieldBuilder<TItem> {
    this._config.arrayConfig = { ...this._config.arrayConfig, min: length };
    return this;
  }

  max(length: number): ArrayFieldBuilder<TItem> {
    this._config.arrayConfig = { ...this._config.arrayConfig, max: length };
    return this;
  }
}

/**
 * Record/Map field builder
 */
export class RecordFieldBuilder<
    TKey extends StringFieldBuilder | NumberFieldBuilder,
    TValue extends AnyFieldBuilder,
  >
  extends FieldBuilder<
    Record<InferFieldBuilderType<TKey>, InferFieldBuilderType<TValue>>,
    RecordFieldBuilder<TKey, TValue>
  >
  implements IRecordFieldBuilder<TKey, TValue>
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
export class UnionFieldBuilder<TVariants extends AnyFieldBuilder[]>
  extends FieldBuilder<InferFieldBuilderType<TVariants[number]>, UnionFieldBuilder<TVariants>>
  implements IUnionFieldBuilder<TVariants>
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
