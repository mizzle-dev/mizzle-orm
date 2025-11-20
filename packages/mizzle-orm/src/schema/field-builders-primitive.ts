/**
 * Primitive field builder implementations (string, number, boolean, date)
 */

import { FieldType } from '../types/field';
import type {
  StringFieldBuilder as IStringFieldBuilder,
  NumberFieldBuilder as INumberFieldBuilder,
  BooleanFieldBuilder as IBooleanFieldBuilder,
  DateFieldBuilder as IDateFieldBuilder,
  EnumFieldBuilder as IEnumFieldBuilder,
} from '../types/field';
import type { FieldConfigState, EmptyConfig } from '../types/field-config';
import { FieldBuilder } from './field-builder-base';

/**
 * String field builder
 */
export class StringFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<string, TConfig, StringFieldBuilder<TConfig>>
  implements IStringFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.STRING, {
      stringConfig: {},
    });
  }

  min(length: number): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, min: length };
    return this;
  }

  max(length: number): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, max: length };
    return this;
  }

  length(length: number): StringFieldBuilder<TConfig> {
    this._config.stringConfig = {
      ...this._config.stringConfig,
      min: length,
      max: length,
    };
    return this;
  }

  pattern(regex: RegExp): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, pattern: regex };
    return this;
  }

  email(): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, email: true };
    return this;
  }

  url(): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, url: true };
    return this;
  }

  uuid(): StringFieldBuilder<TConfig> {
    this._config.stringConfig = { ...this._config.stringConfig, uuid: true };
    return this;
  }

  enum<T extends readonly string[]>(values: T): EnumFieldBuilder<T[number], TConfig> {
    return new EnumFieldBuilder(values);
  }
}

/**
 * Number field builder
 */
export class NumberFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<number, TConfig, NumberFieldBuilder<TConfig>>
  implements INumberFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.NUMBER, {
      numberConfig: {},
    });
  }

  min(value: number): NumberFieldBuilder<TConfig> {
    this._config.numberConfig = { ...this._config.numberConfig, min: value };
    return this;
  }

  max(value: number): NumberFieldBuilder<TConfig> {
    this._config.numberConfig = { ...this._config.numberConfig, max: value };
    return this;
  }

  int(): NumberFieldBuilder<TConfig> {
    this._config.numberConfig = { ...this._config.numberConfig, int: true };
    return this;
  }

  positive(): NumberFieldBuilder<TConfig> {
    this._config.numberConfig = { ...this._config.numberConfig, positive: true };
    return this;
  }
}

/**
 * Boolean field builder
 */
export class BooleanFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<boolean, TConfig, BooleanFieldBuilder<TConfig>>
  implements IBooleanFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.BOOLEAN);
  }
}

/**
 * Date field builder
 */
export class DateFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<Date, TConfig, DateFieldBuilder<TConfig>>
  implements IDateFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.DATE);
  }

  defaultNow(): DateFieldBuilder<TConfig & { hasDefaultNow: true; hasDefault: true }> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      defaultNow: true,
      defaultValue: () => new Date(),
    }) as any;
  }

  onUpdateNow(): DateFieldBuilder<TConfig & { hasOnUpdateNow: true }> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      onUpdateNow: true,
    }) as any;
  }

  min(_date: Date): DateFieldBuilder<TConfig> {
    // Store in config for validation (to be implemented)
    return this;
  }

  max(_date: Date): DateFieldBuilder<TConfig> {
    // Store in config for validation (to be implemented)
    return this;
  }
}

/**
 * Enum field builder
 */
export class EnumFieldBuilder<T extends string, TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<T, TConfig, EnumFieldBuilder<T, TConfig>>
  implements IEnumFieldBuilder<T, TConfig>
{
  readonly _values: readonly T[];

  constructor(values: readonly T[]) {
    super(FieldType.STRING, {
      enumConfig: { values },
    });
    this._values = values;
  }
}
