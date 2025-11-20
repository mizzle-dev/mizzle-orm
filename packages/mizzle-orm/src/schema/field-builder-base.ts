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

/**
 * Base field builder class with chainable methods
 */
export class FieldBuilder<TType, TSelf extends FieldBuilder<TType, TSelf>>
  implements BaseFieldBuilder<TType, TSelf>
{
  readonly _type!: TType;
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
  optional(): BaseFieldBuilder<TType | undefined, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      optional: true,
    }) as any;
  }

  /**
   * Make this field nullable (can be null)
   */
  nullable(): BaseFieldBuilder<TType | null, TSelf> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      nullable: true,
    }) as any;
  }

  /**
   * Set a default value for this field
   */
  default(value: DefaultValue<TType>): TSelf {
    this._config.defaultValue = value;
    return this as unknown as TSelf;
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
  tenantKey(): TSelf {
    this._config.isTenantKey = true;
    return this as unknown as TSelf;
  }

  /**
   * Mark this field as an owner key (for ownership tracking)
   */
  ownerKey(): TSelf {
    this._config.isOwnerKey = true;
    return this as unknown as TSelf;
  }

  /**
   * Mark this field as a soft delete flag
   */
  softDeleteFlag(): TSelf {
    this._config.isSoftDeleteFlag = true;
    return this as unknown as TSelf;
  }
}
