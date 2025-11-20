/**
 * Collection configuration builders (index, relation)
 */

import type {
  IndexDefBuilder,
  IndexDef,
  RelationBuilder as IRelationBuilder,
  ReferenceRelation,
  EmbedRelation,
  LookupRelation,
  TypedRelation,
  RelationTargets,
} from '../types/collection';
import { RelationType } from '../types/collection';
import type { SchemaDefinition } from '../types/field';
import type { CollectionDefinition } from '../types/collection';

/**
 * Index definition builder implementation
 */
class IndexDefBuilderImpl implements IndexDefBuilder {
  private fields: string[];
  private options: IndexDef['options'] = {};

  constructor(fields: string[]) {
    this.fields = fields;
  }

  unique(): IndexDef {
    this.options.unique = true;
    return this.build();
  }

  sparse(): IndexDef {
    this.options.sparse = true;
    return this.build();
  }

  ttl(seconds: number): IndexDef {
    this.options.ttl = seconds;
    return this.build();
  }

  name(name: string): IndexDef {
    this.options.name = name;
    return this.build();
  }

  partial(filter: Record<string, unknown>): IndexDef {
    this.options.partialFilterExpression = filter;
    return this.build();
  }

  background(): IndexDef {
    this.options.background = true;
    return this.build();
  }

  private build(): IndexDef {
    return {
      fields: this.fields,
      options: this.options,
    };
  }
}

/**
 * Index builder factory
 */
export function createIndexBuilder<TSchema extends SchemaDefinition>(_schema: TSchema) {
  return (...fields: Array<TSchema[keyof TSchema]>): IndexDefBuilder => {
    // Extract field names from the field builders
    // In practice, we need to track which field name corresponds to which builder
    // For now, we'll need to pass field names differently or enhance the builder
    const fieldNames = fields.map((_, i) => {
      // This is a simplified version - in reality, we need to map builders to field names
      return `field_${i}`;
    });
    return new IndexDefBuilderImpl(fieldNames);
  };
}

/**
 * Relation builder implementation
 */
class RelationBuilderImpl<TSchema extends SchemaDefinition> implements IRelationBuilder<TSchema> {
  reference<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
    otherCollection: CollectionDefinition<TOther, TTargets>,
    config: Omit<ReferenceRelation, 'type' | 'targetCollection'>,
  ): TypedRelation<ReferenceRelation, CollectionDefinition<TOther, TTargets>> {
    return {
      type: RelationType.REFERENCE,
      targetCollection: otherCollection._meta.name,
      ...config,
    } as any; // Runtime object is ReferenceRelation, type system sees TypedRelation
  }

  embed<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
    sourceCollection: CollectionDefinition<TOther, TTargets>,
    config: Omit<EmbedRelation, 'type' | 'sourceCollection'>,
  ): TypedRelation<EmbedRelation, CollectionDefinition<TOther, TTargets>> {
    return {
      type: RelationType.EMBED,
      sourceCollection: sourceCollection._meta.name,
      ...config,
    } as any; // Runtime object is EmbedRelation, type system sees TypedRelation
  }

  lookup<TOther extends SchemaDefinition, TTargets extends RelationTargets>(
    targetCollection: CollectionDefinition<TOther, TTargets>,
    config: Omit<LookupRelation, 'type' | 'targetCollection'>,
  ): TypedRelation<LookupRelation, CollectionDefinition<TOther, TTargets>> {
    return {
      type: RelationType.LOOKUP,
      targetCollection: targetCollection._meta.name,
      ...config,
    } as any; // Runtime object is LookupRelation, type system sees TypedRelation
  }
}

/**
 * Relation builder factory
 */
export function createRelationBuilder<
  TSchema extends SchemaDefinition,
>(): IRelationBuilder<TSchema> {
  return new RelationBuilderImpl<TSchema>();
}
