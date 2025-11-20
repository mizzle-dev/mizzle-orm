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
import { FieldBuilder } from './field-builder-base';

/**
 * String field builder
 */
export class StringFieldBuilder
  extends FieldBuilder<string, StringFieldBuilder>
  implements IStringFieldBuilder
{
  constructor() {
    super(FieldType.STRING, {
      stringConfig: {},
    });
  }

  min(length: number): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, min: length };
    return this;
  }

  max(length: number): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, max: length };
    return this;
  }

  length(length: number): StringFieldBuilder {
    this._config.stringConfig = {
      ...this._config.stringConfig,
      min: length,
      max: length,
    };
    return this;
  }

  pattern(regex: RegExp): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, pattern: regex };
    return this;
  }

  email(): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, email: true };
    return this;
  }

  url(): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, url: true };
    return this;
  }

  uuid(): StringFieldBuilder {
    this._config.stringConfig = { ...this._config.stringConfig, uuid: true };
    return this;
  }

  enum<T extends readonly string[]>(values: T): EnumFieldBuilder<T[number]> {
    return new EnumFieldBuilder(values);
  }
}

/**
 * Number field builder
 */
export class NumberFieldBuilder
  extends FieldBuilder<number, NumberFieldBuilder>
  implements INumberFieldBuilder
{
  constructor() {
    super(FieldType.NUMBER, {
      numberConfig: {},
    });
  }

  min(value: number): NumberFieldBuilder {
    this._config.numberConfig = { ...this._config.numberConfig, min: value };
    return this;
  }

  max(value: number): NumberFieldBuilder {
    this._config.numberConfig = { ...this._config.numberConfig, max: value };
    return this;
  }

  int(): NumberFieldBuilder {
    this._config.numberConfig = { ...this._config.numberConfig, int: true };
    return this;
  }

  positive(): NumberFieldBuilder {
    this._config.numberConfig = { ...this._config.numberConfig, positive: true };
    return this;
  }
}

/**
 * Boolean field builder
 */
export class BooleanFieldBuilder
  extends FieldBuilder<boolean, BooleanFieldBuilder>
  implements IBooleanFieldBuilder
{
  constructor() {
    super(FieldType.BOOLEAN);
  }
}

/**
 * Date field builder
 */
export class DateFieldBuilder
  extends FieldBuilder<Date, DateFieldBuilder>
  implements IDateFieldBuilder
{
  constructor() {
    super(FieldType.DATE);
  }

  defaultNow(): DateFieldBuilder {
    this._config.defaultNow = true;
    this._config.defaultValue = () => new Date();
    return this;
  }

  onUpdateNow(): DateFieldBuilder {
    this._config.onUpdateNow = true;
    return this;
  }

  min(_date: Date): DateFieldBuilder {
    // Store in config for validation (to be implemented)
    return this;
  }

  max(_date: Date): DateFieldBuilder {
    // Store in config for validation (to be implemented)
    return this;
  }
}

/**
 * Enum field builder
 */
export class EnumFieldBuilder<T extends string>
  extends FieldBuilder<T, EnumFieldBuilder<T>>
  implements IEnumFieldBuilder<T>
{
  readonly _values: readonly T[];

  constructor(values: readonly T[]) {
    super(FieldType.STRING, {
      enumConfig: { values },
    });
    this._values = values;
  }
}
