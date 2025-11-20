/**
 * MongoDB-specific field builder implementations
 */

import type { ObjectId, Decimal128, Binary } from 'mongodb';
import { FieldType } from '../types/field';
import type {
  ObjectIdFieldBuilder as IObjectIdFieldBuilder,
  PublicIdFieldBuilder as IPublicIdFieldBuilder,
  DecimalFieldBuilder as IDecimalFieldBuilder,
  BinaryFieldBuilder as IBinaryFieldBuilder,
  JsonFieldBuilder as IJsonFieldBuilder,
  GeoPointFieldBuilder as IGeoPointFieldBuilder,
} from '../types/field';
import type { FieldConfigState, EmptyConfig } from '../types/field-config';
import { FieldBuilder } from './field-builder-base';

/**
 * ObjectId field builder
 */
export class ObjectIdFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<ObjectId, TConfig, ObjectIdFieldBuilder<TConfig>>
  implements IObjectIdFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.OBJECT_ID);
  }

  internalId(): ObjectIdFieldBuilder<TConfig & { isInternalId: true }> {
    return new FieldBuilder(this._config.type, {
      ...this._config,
      isInternalId: true,
    }) as any;
  }
}

/**
 * Public ID field builder (prefixed IDs)
 * By default, public IDs are auto-generated
 */
export class PublicIdFieldBuilder<
    TConfig extends FieldConfigState = EmptyConfig & { isPublicId: true },
  >
  extends FieldBuilder<string, TConfig, PublicIdFieldBuilder<TConfig>>
  implements IPublicIdFieldBuilder<TConfig>
{
  readonly _prefix: string;

  constructor(prefix: string) {
    super(FieldType.PUBLIC_ID, {
      isPublicId: true,
      publicIdConfig: { prefix },
    });
    this._prefix = prefix;
  }
}

/**
 * Decimal128 field builder
 */
export class DecimalFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<Decimal128, TConfig, DecimalFieldBuilder<TConfig>>
  implements IDecimalFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.DECIMAL);
  }
}

/**
 * Binary field builder
 */
export class BinaryFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<Binary, TConfig, BinaryFieldBuilder<TConfig>>
  implements IBinaryFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.BINARY);
  }
}

/**
 * JSON field builder (arbitrary JSON data)
 */
export class JsonFieldBuilder<T = unknown, TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<T, TConfig, JsonFieldBuilder<T, TConfig>>
  implements IJsonFieldBuilder<T, TConfig>
{
  constructor() {
    super(FieldType.JSON);
  }
}

/**
 * GeoPoint field builder (GeoJSON Point)
 */
export class GeoPointFieldBuilder<TConfig extends FieldConfigState = EmptyConfig>
  extends FieldBuilder<
    { type: 'Point'; coordinates: [number, number] },
    TConfig,
    GeoPointFieldBuilder<TConfig>
  >
  implements IGeoPointFieldBuilder<TConfig>
{
  constructor() {
    super(FieldType.GEO_POINT);
  }
}
