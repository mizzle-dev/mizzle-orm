/**
 * Base field builder implementation
 */

import type {
  FieldConfig,
  FieldType,
  BaseFieldBuilder,
  IndexConfig,
  SearchConfig,
  AuditConfig,
  DefaultValue,
} from '../types/field';
import type { FieldConfigState } from '../types/field-config';

/**
 * Base field builder class with chainable methods
 *
 * @template TType - The TypeScript type this field produces
 * @template TConfig - The type-level configuration state
 * @template TSelf - The concrete builder type for method chaining
 */
export class FieldBuilder<
  TType,
  TConfig extends FieldConfigState,
  TSelf extends FieldBuilder<TType, TConfig, TSelf>,
> implements BaseFieldBuilder<TType, TConfig, TSelf>
{
  readonly _type!: TType;
  readonly _configState!: TConfig; // Phantom type, never assigned
  readonly _config: FieldConfig<TType>;

  constructor(type: FieldType, config: Partial<FieldConfig<TType>> = {}) {
    this._config = {
      type,
      optional: false,
      nullable: false,
      ...config,
    };
  }

  /**
   * Make this field optional (can be undefined)
   */
  optional(): BaseFieldBuilder<TType | undefined, TConfig & { optional: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      optional: true,
    }) as any;
  }

  /**
   * Make this field nullable (can be null)
   */
  nullable(): BaseFieldBuilder<TType | null, TConfig & { nullable: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      nullable: true,
    }) as any;
  }

  /**
   * Set a default value for this field
   */
  default(
    value: DefaultValue<TType>,
  ): BaseFieldBuilder<TType, TConfig & { hasDefault: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      defaultValue: value,
    }) as any;
  }

  /**
   * Add an index to this field
   */
  index(config: Omit<IndexConfig, 'type'> = {}): TSelf {
    this._config.index = {
      type: 'asc',
      ...config,
    };
    return this as unknown as TSelf;
  }

  /**
   * Mark this field as unique (creates unique index)
   */
  unique(config: Omit<IndexConfig, 'unique'> = {}): TSelf {
    this._config.index = {
      type: 'asc',
      unique: true,
      ...config,
    };
    return this as unknown as TSelf;
  }

  /**
   * Add Atlas Search configuration
   */
  search(config: SearchConfig): TSelf {
    this._config.search = config;
    return this as unknown as TSelf;
  }

  /**
   * Add audit/redaction configuration
   */
  audit(config: AuditConfig): TSelf {
    this._config.audit = config;
    return this as unknown as TSelf;
  }

  /**
   * Mark this field as a tenant key (for multi-tenancy)
   */
  tenantKey(): BaseFieldBuilder<TType, TConfig & { isTenantKey: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      isTenantKey: true,
    }) as any;
  }

  /**
   * Mark this field as an owner key (for ownership tracking)
   */
  ownerKey(): BaseFieldBuilder<TType, TConfig & { isOwnerKey: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      isOwnerKey: true,
    }) as any;
  }

  /**
   * Mark this field as a soft delete flag
   */
  softDeleteFlag(): BaseFieldBuilder<TType, TConfig & { isSoftDeleteFlag: true }, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      isSoftDeleteFlag: true,
    }) as any;
  }
}
