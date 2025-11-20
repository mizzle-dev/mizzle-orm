/**
 * Collection definition function
 */

import type {
  CollectionDefinition,
  CollectionMeta,
  CollectionOptions,
  IndexDef,
  Relations,
  PolicyConfig,
  Hooks,
  CollectionAuditConfig,
} from '../types/collection';
import type { SchemaDefinition } from '../types/field';
import { createRelationBuilder } from './builders';

/**
 * Define a MongoDB collection with schema and metadata
 *
 * @param name - Collection name
 * @param schema - Schema definition object
 * @param options - Optional collection configuration
 * @returns Collection definition
 *
 * @example
 * ```ts
 * import { objectId, publicId, string, date } from 'mizzle-orm';
 *
 * const users = mongoCollection(
 *   'users',
 *   {
 *     _id: objectId().internalId(),
 *     id: publicId('user'),
 *     email: string().email().unique(),
 *     displayName: string(),
 *     createdAt: date().defaultNow(),
 *   },
 *   {
 *     policies: {
 *       readFilter: (ctx) => ({ orgId: ctx.tenantId }),
 *     },
 *   }
 * );
 * ```
 */
export function mongoCollection<TSchema extends SchemaDefinition>(
  name: string,
  schema: TSchema,
  options: CollectionOptions<TSchema> = {},
): CollectionDefinition<TSchema> {
  // Build indexes
  const indexes: IndexDef[] = [];
  if (options.indexes) {
    // Create a simple index builder for now
    // In a full implementation, we'd properly map field builders to field names
    const idx = createSimpleIndexBuilder(schema);
    const indexDefs = options.indexes(idx as any, schema);
    indexes.push(...indexDefs);
  }

  // Collect field-level indexes
  for (const [fieldName, fieldBuilder] of Object.entries(schema)) {
    if (fieldBuilder._config.index) {
      const indexConfig = fieldBuilder._config.index;
      indexes.push({
        fields: [fieldName],
        options: {
          unique: indexConfig.unique,
          sparse: indexConfig.sparse,
          ttl: indexConfig.ttl,
          name: indexConfig.name,
          partialFilterExpression: indexConfig.partialFilterExpression,
        },
      });
    }
  }

  // Build relations
  let relations: Relations = {};
  if (options.relations) {
    const relationBuilder = createRelationBuilder<TSchema>();
    relations = options.relations(relationBuilder, {} as any);
  }

  // Policies (plain object)
  const policies: PolicyConfig<TSchema> = options.policies || {};

  // Hooks (plain object)
  const hooks: Hooks<TSchema> = options.hooks || {};

  // Audit config
  const audit: CollectionAuditConfig = options.audit || {
    enabled: false,
  };

  // Search indexes (placeholder for now)
  const searchIndexes: any[] = [];

  // Create metadata
  const meta: CollectionMeta<TSchema> = {
    name,
    schema,
    indexes,
    searchIndexes,
    relations,
    policies,
    audit,
    hooks,
  };

  // Create collection definition
  const definition: CollectionDefinition<TSchema> = {
    _schema: schema,
    _meta: meta,
    _brand: 'CollectionDefinition',
    $inferDocument: null as any,
    $inferInsert: null as any,
    $inferUpdate: null as any,
  };

  return definition;
}

/**
 * Simple index builder for compound indexes
 */
function createSimpleIndexBuilder<TSchema extends SchemaDefinition>(_schema: TSchema) {
  return (...fieldNames: string[]) => {
    return {
      unique(): IndexDef {
        return {
          fields: fieldNames,
          options: { unique: true },
        };
      },
      sparse(): IndexDef {
        return {
          fields: fieldNames,
          options: { sparse: true },
        };
      },
      ttl(seconds: number): IndexDef {
        return {
          fields: fieldNames,
          options: { ttl: seconds },
        };
      },
      name(name: string): IndexDef {
        return {
          fields: fieldNames,
          options: { name },
        };
      },
      partial(filter: Record<string, unknown>): IndexDef {
        return {
          fields: fieldNames,
          options: { partialFilterExpression: filter },
        };
      },
      background(): IndexDef {
        return {
          fields: fieldNames,
          options: { background: true },
        };
      },
      // Allow chaining to end with no modifier
      fields: fieldNames,
      options: {},
    } as any;
  };
}
