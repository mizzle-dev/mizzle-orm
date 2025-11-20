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
import { FieldBuilder } from './field-builder-base';

/**
 * ObjectId field builder
 */
export class ObjectIdFieldBuilder
  extends FieldBuilder<ObjectId, ObjectIdFieldBuilder>
  implements IObjectIdFieldBuilder
{
  constructor() {
    super(FieldType.OBJECT_ID);
  }

  internalId(): ObjectIdFieldBuilder {
    this._config.isInternalId = true;
    return this;
  }
}

/**
 * Public ID field builder (prefixed IDs)
 */
export class PublicIdFieldBuilder
  extends FieldBuilder<string, PublicIdFieldBuilder>
  implements IPublicIdFieldBuilder
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
export class DecimalFieldBuilder
  extends FieldBuilder<Decimal128, DecimalFieldBuilder>
  implements IDecimalFieldBuilder
{
  constructor() {
    super(FieldType.DECIMAL);
  }
}

/**
 * Binary field builder
 */
export class BinaryFieldBuilder
  extends FieldBuilder<Binary, BinaryFieldBuilder>
  implements IBinaryFieldBuilder
{
  constructor() {
    super(FieldType.BINARY);
  }
}

/**
 * JSON field builder (arbitrary JSON data)
 */
export class JsonFieldBuilder<T = unknown>
  extends FieldBuilder<T, JsonFieldBuilder<T>>
  implements IJsonFieldBuilder<T>
{
  constructor() {
    super(FieldType.JSON);
  }
}

/**
 * GeoPoint field builder (GeoJSON Point)
 */
export class GeoPointFieldBuilder
  extends FieldBuilder<{ type: 'Point'; coordinates: [number, number] }, GeoPointFieldBuilder>
  implements IGeoPointFieldBuilder
{
  constructor() {
    super(FieldType.GEO_POINT);
  }
}
