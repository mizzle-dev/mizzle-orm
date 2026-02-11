/**
 * Collection facade - provides type-safe CRUD operations for a collection
 */

import { Collection, ObjectId, type Db, type Document } from 'mongodb';
import type { CollectionDefinition, RelationTargets } from '../types/collection';
import type { OrmContext, QueryOptions } from '../types/orm';
import type { SchemaDefinition } from '../types/field';
import type { Filter } from '../types/inference';
import type { Middleware, MiddlewareContext, Operation } from '../types/middleware';
import type { SSCollectionDefinition } from '../collection/from-standard-schema';
import { isSSCollectionDefinition } from '../collection/from-standard-schema';
import { SSValidationError, type ValidationIssue } from '../errors/validation-error';
import { generatePublicId } from '../utils/public-id';
import { RelationHelper } from './relations';
import { RelationPipelineBuilder } from './relation-pipeline-builder';

/**
 * Collection facade providing CRUD operations
 *
 * @template TDoc - The document type
 * @template TInsert - The insert type
 * @template TUpdate - The update type
 * @template TRelationTargets - Map of relation names to their target collections
 */
export class CollectionFacade<
  TDoc extends Document = Document,
  TInsert = TDoc,
  TUpdate = Partial<TDoc>,
  TRelationTargets extends RelationTargets = {},
> {
  private collection: Collection<TDoc>;
  private collectionDef: CollectionDefinition<SchemaDefinition, TRelationTargets>;
  private ctx: OrmContext;
  private relationHelper: RelationHelper<TDoc>;
  private db: Db;
  private reverseEmbedRegistry?: Map<
    string,
    Array<{ targetCollectionName: string; relationName: string; config: any }>
  >;
  private deleteRegistry?: Map<
    string,
    Array<{ targetCollectionName: string; relationName: string; config: any; deleteAction: string }>
  >;
  private globalMiddlewares: Middleware[];
  private collectionMiddlewares: Middleware[];

  constructor(
    db: Db,
    collectionDef: CollectionDefinition<SchemaDefinition, TRelationTargets>,
    ctx: OrmContext,
    options?: {
      reverseEmbedRegistry?: Map<
        string,
        Array<{ targetCollectionName: string; relationName: string; config: any }>
      >;
      deleteRegistry?: Map<
        string,
        Array<{
          targetCollectionName: string;
          relationName: string;
          config: any;
          deleteAction: string;
        }>
      >;
      globalMiddlewares?: Middleware[];
      collectionMiddlewares?: Middleware[];
    },
  ) {
    this.db = db;
    this.collection = db.collection<TDoc>(collectionDef._meta.name);
    this.collectionDef = collectionDef;
    this.ctx = ctx;
    this.relationHelper = new RelationHelper<TDoc>(db, collectionDef, ctx);
    this.reverseEmbedRegistry = options?.reverseEmbedRegistry;
    this.deleteRegistry = options?.deleteRegistry;
    this.globalMiddlewares = options?.globalMiddlewares || [];
    this.collectionMiddlewares = options?.collectionMiddlewares || [];
  }

  /**
   * Validate data against Standard Schema if this collection uses one
   * Does nothing for regular field-builder collections (backward compatible)
   * 
   * @param data - The data to validate
   * @param options - Validation options
   * @param options.partial - If true, skip validation (for partial updates)
   * @throws SSValidationError if validation fails
   */
  private async validateWithStandardSchema(
    data: unknown,
    options: { partial?: boolean } = {},
  ): Promise<void> {
    // Skip validation if not a Standard Schema collection
    if (!isSSCollectionDefinition(this.collectionDef)) {
      return;
    }

    const ssCollectionDef = this.collectionDef as unknown as SSCollectionDefinition<any>;
    const schema = ssCollectionDef._schema;

    // Call Standard Schema's validate method
    const result = await schema['~standard'].validate(data);

    // Check for validation issues
    if (result.issues && result.issues.length > 0) {
      if (options.partial) {
        // For partial validation (updates), only report issues for fields present in the data.
        // This allows updates like { name: 'New Name' } without failing due to missing email.
        // But if name itself is invalid, we catch it.
        const updateKeys = typeof data === 'object' && data !== null
          ? new Set(Object.keys(data as object))
          : new Set<string>();

        const relevantIssues = result.issues.filter((issue: ValidationIssue) => {
          // If no path, it's a top-level structural issue - skip for partial validation
          if (!issue.path || issue.path.length === 0) {
            return false;
          }

          // Check if the first path segment is a key in our update data
          const firstSegment = issue.path[0];
          return updateKeys.has(String(firstSegment));
        });

        if (relevantIssues.length > 0) {
          throw new SSValidationError(relevantIssues);
        }
        // No relevant issues for the fields we're updating - validation passed
        return;
      }

      throw new SSValidationError(result.issues);
    }
  }

  /**
   * Execute an operation with middleware chain
   * @template TResult - The return type of the operation (preserved through the chain)
   */
  private async executeWithMiddlewares<TResult>(
    operation: Operation,
    executor: () => Promise<TResult>,
    context: Partial<MiddlewareContext> = {},
  ): Promise<TResult> {
    // If no middlewares, execute directly
    const allMiddlewares = [...this.globalMiddlewares, ...this.collectionMiddlewares];
    if (allMiddlewares.length === 0) {
      return executor();
    }

    // Build middleware context
    const middlewareContext: MiddlewareContext = {
      orm: this.ctx,
      collection: this.collectionDef._meta.name,
      operation,
      startedAt: Date.now(),
      collectionDef: this.collectionDef,
      ...context,
    };

    // Build middleware chain using reduceRight to preserve type TResult
    const chain = allMiddlewares.reduceRight(
      (next, middleware) => () => middleware(middlewareContext, next),
      executor,
    );

    return chain();
  }

  /**
   * Find a document by ID (_id or public ID)
   */
  async findById(id: string | ObjectId, options?: QueryOptions<TRelationTargets>): Promise<any> {
    return this.executeWithMiddlewares(
      'findById',
      async () => {
        const filter = this.buildIdFilter(id);
        // Call the inner logic of findOne directly to avoid double middleware execution
        const policyFilter = this.applyPolicies(filter);
        const finalFilter = this.applySoftDeleteFilter(policyFilter);

        // If include is specified, use aggregation pipeline
        if (options?.include) {
          const pipeline: Document[] = [];

          // Start with $match stage
          pipeline.push({ $match: finalFilter });

          // Add $lookup stages for relations
          const lookupStages = RelationPipelineBuilder.buildPipeline(
            this.collectionDef,
            options.include,
          );
          pipeline.push(...lookupStages);

          // Limit to 1 document
          pipeline.push({ $limit: 1 });

          // Execute aggregation
          const results = await this.collection
            .aggregate(pipeline, { session: this.ctx.session })
            .toArray();

          return results.length > 0 ? (results[0] as any) : null;
        }

        const result = await this.collection.findOne(finalFilter, {
          session: this.ctx.session,
        });
        return result as TDoc | null;
      },
      { filter: this.buildIdFilter(id), options },
    );
  }

  /**
   * Find one document matching the filter
   */
  async findOne(filter: Filter<TDoc>, options?: QueryOptions<TRelationTargets>): Promise<any> {
    return this.executeWithMiddlewares(
      'findOne',
      async () => {
        const policyFilter = this.applyPolicies(filter);
        const finalFilter = this.applySoftDeleteFilter(policyFilter);

        // If include is specified, use aggregation pipeline
        if (options?.include) {
          const pipeline: Document[] = [];

          // Start with $match stage
          pipeline.push({ $match: finalFilter });

          // Add $lookup stages for relations
          const lookupStages = RelationPipelineBuilder.buildPipeline(
            this.collectionDef,
            options.include,
          );
          pipeline.push(...lookupStages);

          // Limit to 1 document
          pipeline.push({ $limit: 1 });

          // Execute aggregation
          const results = await this.collection
            .aggregate(pipeline, { session: this.ctx.session })
            .toArray();

          return results.length > 0 ? (results[0] as any) : null;
        }

        const result = await this.collection.findOne(finalFilter, {
          session: this.ctx.session,
        });
        return result as TDoc | null;
      },
      { filter, options },
    );
  }

  /**
   * Find multiple documents matching the filter
   */
  async findMany(
    filter: Filter<TDoc> = {},
    options?: QueryOptions<TRelationTargets>,
  ): Promise<any> {
    return this.executeWithMiddlewares(
      'findMany',
      async () => {
        const policyFilter = this.applyPolicies(filter);
        const finalFilter = this.applySoftDeleteFilter(policyFilter);

        // If include is specified, use aggregation pipeline
        if (options?.include) {
          const pipeline: Document[] = [];

          // Start with $match stage
          pipeline.push({ $match: finalFilter });

          // Add sort, skip, limit before lookups for better performance
          if (options.sort) {
            pipeline.push({ $sort: options.sort });
          }
          if (options.skip) {
            pipeline.push({ $skip: options.skip });
          }
          if (options.limit) {
            pipeline.push({ $limit: options.limit });
          }

          // Add $lookup stages for relations
          const lookupStages = RelationPipelineBuilder.buildPipeline(
            this.collectionDef,
            options.include,
          );
          pipeline.push(...lookupStages);

          // Execute aggregation
          const results = await this.collection
            .aggregate(pipeline, { session: this.ctx.session })
            .toArray();

          return results as any[];
        }

        let cursor = this.collection.find(finalFilter, {
          session: this.ctx.session,
        });

        if (options?.sort) {
          cursor = cursor.sort(options.sort);
        }
        if (options?.skip) {
          cursor = cursor.skip(options.skip);
        }
        if (options?.limit) {
          cursor = cursor.limit(options.limit);
        }

        let results = await cursor.toArray() as TDoc[];

        // Query-time refresh: Re-fetch specified embeds (read-only, not persisted)
        if (options?.refreshEmbeds && options.refreshEmbeds.length > 0) {
          results = await this.refreshEmbedsInDocuments(results, options.refreshEmbeds);
        }

        return results;
      },
      { filter, options },
    );
  }

  /**
   * Count documents matching the filter
   */
  async count(filter: Filter<TDoc> = {}): Promise<number> {
    return this.executeWithMiddlewares(
      'count',
      async () => {
        const policyFilter = this.applyPolicies(filter);
        const finalFilter = this.applySoftDeleteFilter(policyFilter);
        return this.collection.countDocuments(finalFilter, {
          session: this.ctx.session,
        });
      },
      { filter },
    );
  }

  /**
   * Create a new document
   */
  async create(data: TInsert): Promise<TDoc> {
    return this.executeWithMiddlewares(
      'create',
      async () => {
        // Validate against Standard Schema if applicable (throws SSValidationError on failure)
        await this.validateWithStandardSchema(data);

        // Apply defaults and auto-generated fields
        const doc = await this.applyDefaults(data as any);

        // Run before hooks (SS collections don't have hooks)
        let finalDoc = doc;
        const hooks = (this.collectionDef._meta as any).hooks;
        if (hooks?.beforeInsert) {
          finalDoc = await hooks.beforeInsert(this.ctx, finalDoc);
        }

        // Check policies (SS collections don't have policies)
        const policies = (this.collectionDef._meta as any).policies;
        if (policies?.canInsert) {
          const allowed = await policies.canInsert(this.ctx, finalDoc);
          if (!allowed) {
            throw new Error('Insert not allowed by policy');
          }
        }

        // Validate references (skip for SS collections - they don't have relations yet)
        if (!isSSCollectionDefinition(this.collectionDef)) {
          await this.relationHelper.validateReferences(finalDoc as any);
          // Process forward embeds (fetch and embed referenced data)
          finalDoc = (await this.relationHelper.processForwardEmbeds(finalDoc as any)) as any;
        }

        // Insert
        const result = await this.collection.insertOne(finalDoc as any, {
          session: this.ctx.session,
        });

        const inserted = {
          ...finalDoc,
          _id: result.insertedId,
        } as unknown as TDoc;

        // Run after hooks
        if (hooks?.afterInsert) {
          await hooks.afterInsert(this.ctx, inserted);
        }

        return inserted;
      },
      { data },
    );
  }

  /**
   * Update a document by ID
   */
  async updateById(id: string | ObjectId, data: TUpdate): Promise<TDoc | null> {
    const filter = this.buildIdFilter(id);
    return this.executeWithMiddlewares(
      'updateById',
      async () => {
        return this.updateOneInternal(filter, data);
      },
      { filter, data },
    );
  }

  /**
   * Update one document matching the filter
   */
  async updateOne(filter: Filter<TDoc>, data: TUpdate): Promise<TDoc | null> {
    return this.executeWithMiddlewares(
      'update',
      async () => {
        return this.updateOneInternal(filter, data);
      },
      { filter, data, oldDoc: undefined }, // oldDoc will be fetched inside
    );
  }

  /**
   * Internal update logic (shared by updateOne and updateById)
   */
  private async updateOneInternal(filter: Filter<TDoc>, data: TUpdate): Promise<TDoc | null> {
    // Note: Updates are partial and won't match the full schema
    // Skip Standard Schema validation for updates
    await this.validateWithStandardSchema(data, { partial: true });

    const finalFilter = this.applyPolicies(filter);

    // Get old document for hooks and policies
    const oldDoc = await this.collection.findOne(finalFilter, {
      session: this.ctx.session,
    });
    if (!oldDoc) {
      return null;
    }

    // Apply update timestamp
    const updateData = this.applyUpdateTimestamps(data as any);

    // Run before hooks (SS collections don't have hooks)
    let finalUpdate = updateData;
    const hooks = (this.collectionDef._meta as any).hooks;
    if (hooks?.beforeUpdate) {
      finalUpdate = await hooks.beforeUpdate(
        this.ctx,
        oldDoc as any,
        updateData,
      );
    }

    // Check policies (SS collections don't have policies)
    const policies = (this.collectionDef._meta as any).policies;
    if (policies?.canUpdate) {
      const allowed = await policies.canUpdate(
        this.ctx,
        oldDoc as any,
        finalUpdate,
      );
      if (!allowed) {
        throw new Error('Update not allowed by policy');
      }
    }

    // Validate references and process embeds (skip for SS collections)
    if (!isSSCollectionDefinition(this.collectionDef)) {
      await this.relationHelper.validateReferences(finalUpdate as any);
      finalUpdate = (await this.relationHelper.processForwardEmbeds(finalUpdate as any)) as any;
    }

    // Update
    const result = await this.collection.findOneAndUpdate(
      finalFilter,
      { $set: finalUpdate } as any,
      {
        returnDocument: 'after',
        session: this.ctx.session,
      },
    );

    if (!result) {
      return null;
    }

    // Run after hooks
    if (hooks?.afterUpdate) {
      await hooks.afterUpdate(this.ctx, oldDoc as any, result as any);
    }

    // Propagate reverse embeds if this collection is a source for any embeds (skip for SS collections)
    if (!isSSCollectionDefinition(this.collectionDef)) {
      await this.propagateReverseEmbeds(result as TDoc, finalUpdate);
    }

    return result as TDoc;
  }

  /**
   * Update many documents matching the filter
   */
  async updateMany(filter: Filter<TDoc>, data: TUpdate): Promise<number> {
    return this.executeWithMiddlewares(
      'updateMany',
      async () => {
        // Note: Updates are partial and won't match the full schema
        // Skip Standard Schema validation for updates
        await this.validateWithStandardSchema(data, { partial: true });

        const finalFilter = this.applyPolicies(filter);
        const updateData = this.applyUpdateTimestamps(data as any);

        const result = await this.collection.updateMany(finalFilter, { $set: updateData } as any, {
          session: this.ctx.session,
        });

        return result.modifiedCount;
      },
      { filter, data },
    );
  }

  /**
   * Delete a document by ID
   */
  async deleteById(id: string | ObjectId): Promise<boolean> {
    const filter = this.buildIdFilter(id);
    return this.executeWithMiddlewares(
      'deleteById',
      async () => {
        return this.deleteOneInternal(filter);
      },
      { filter },
    );
  }

  /**
   * Delete one document matching the filter
   */
  async deleteOne(filter: Filter<TDoc>): Promise<boolean> {
    return this.executeWithMiddlewares(
      'delete',
      async () => {
        return this.deleteOneInternal(filter);
      },
      { filter },
    );
  }

  /**
   * Internal delete logic (shared by deleteOne and deleteById)
   */
  private async deleteOneInternal(filter: Filter<TDoc>): Promise<boolean> {
    const finalFilter = this.applyPolicies(filter);

    // Get document for hooks and policies
    const doc = await this.collection.findOne(finalFilter, {
      session: this.ctx.session,
    });
    if (!doc) {
      return false;
    }

    // Run before hooks (SS collections don't have hooks)
    const hooks = (this.collectionDef._meta as any).hooks;
    if (hooks?.beforeDelete) {
      await hooks.beforeDelete(this.ctx, doc as any);
    }

    // Check policies (SS collections don't have policies)
    const policies = (this.collectionDef._meta as any).policies;
    if (policies?.canDelete) {
      const allowed = await policies.canDelete(this.ctx, doc as any);
      if (!allowed) {
        throw new Error('Delete not allowed by policy');
      }
    }

    // Delete
    const result = await this.collection.deleteOne(finalFilter, {
      session: this.ctx.session,
    });

    // Run after hooks (SS collections don't have hooks)
    if (result.deletedCount > 0 && hooks?.afterDelete) {
      await hooks.afterDelete(this.ctx, doc as any);
    }

    // Handle delete cascades (skip for SS collections - they don't have relations yet)
    if (result.deletedCount > 0 && !isSSCollectionDefinition(this.collectionDef)) {
      await this.handleDeleteCascades(doc as TDoc);
    }

    return result.deletedCount > 0;
  }

  /**
   * Delete many documents matching the filter
   */
  async deleteMany(filter: Filter<TDoc>): Promise<number> {
    return this.executeWithMiddlewares(
      'deleteMany',
      async () => {
        const finalFilter = this.applyPolicies(filter);
        const result = await this.collection.deleteMany(finalFilter, {
          session: this.ctx.session,
        });
        return result.deletedCount;
      },
      { filter },
    );
  }

  /**
   * Soft delete a document by ID
   */
  async softDelete(id: string | ObjectId): Promise<TDoc | null> {
    return this.executeWithMiddlewares(
      'softDelete',
      async () => {
        const softDeleteField = this.getSoftDeleteField();
        if (!softDeleteField) {
          throw new Error('Soft delete not configured for this collection');
        }

        return this.updateById(id, {
          [softDeleteField]: new Date(),
        } as TUpdate);
      },
      { filter: this.buildIdFilter(id) },
    );
  }

  /**
   * Restore a soft-deleted document by ID
   */
  async restore(id: string | ObjectId): Promise<TDoc | null> {
    return this.executeWithMiddlewares(
      'restore',
      async () => {
        const softDeleteField = this.getSoftDeleteField();
        if (!softDeleteField) {
          throw new Error('Soft delete not configured for this collection');
        }

        return this.updateById(id, {
          [softDeleteField]: null,
        } as TUpdate);
      },
      { filter: this.buildIdFilter(id) },
    );
  }

  /**
   * Run aggregation pipeline
   */
  async aggregate(pipeline: Document[]): Promise<Document[]> {
    return this.executeWithMiddlewares(
      'aggregate',
      async () => {
        return this.collection
          .aggregate(pipeline, {
            session: this.ctx.session,
          })
          .toArray();
      },
      { pipeline },
    );
  }

  /**
   * Get raw MongoDB collection
   */
  rawCollection(): Collection<TDoc> {
    return this.collection;
  }

  // ========== Helper Methods ==========

  /**
   * Build filter for ID lookup (supports both _id and publicId)
   */
  private buildIdFilter(id: string | ObjectId): Filter<TDoc> {
    if (id instanceof ObjectId) {
      return { _id: id } as Filter<TDoc>;
    }

    // Check if it looks like a public ID (has underscore)
    if (typeof id === 'string' && id.includes('_')) {
      const publicIdField = this.getPublicIdField();
      if (publicIdField) {
        return { [publicIdField]: id } as Filter<TDoc>;
      }
    }

    // Try to parse as ObjectId
    try {
      return { _id: new ObjectId(id) } as Filter<TDoc>;
    } catch {
      // If not a valid ObjectId, treat as string _id
      return { _id: id } as Filter<TDoc>;
    }
  }

  /**
   * Apply policy filters to a query filter
   */
  private applyPolicies(filter: Filter<TDoc>): Filter<TDoc> {
    // SS collections don't have policies
    const policies = (this.collectionDef._meta as any).policies;

    // Apply read filter
    if (policies?.readFilter) {
      const policyFilter = policies.readFilter(this.ctx);
      return {
        $and: [filter, policyFilter],
      } as Filter<TDoc>;
    }

    return filter;
  }

  /**
   * Apply soft delete filter to exclude soft-deleted documents
   * For SS collections with softDelete enabled, excludes documents where deletedAt is set
   */
  private applySoftDeleteFilter(filter: Filter<TDoc>): Filter<TDoc> {
    // Only apply for SS collections with soft delete configured
    if (!isSSCollectionDefinition(this.collectionDef)) {
      return filter;
    }

    const ssMeta = (this.collectionDef as unknown as SSCollectionDefinition<any>)._meta;
    if (!ssMeta.softDeleteConfig) {
      return filter;
    }

    const softDeleteField = ssMeta.softDeleteConfig.field;

    // Exclude documents where the soft delete field is set (not null/undefined)
    const softDeleteFilter = {
      $or: [
        { [softDeleteField]: null },
        { [softDeleteField]: { $exists: false } },
      ],
    };

    return {
      $and: [filter, softDeleteFilter],
    } as Filter<TDoc>;
  }

  /**
   * Apply default values and generate auto-fields
   * Note: For Standard Schema collections, defaults are handled by the schema itself
   * Exceptions: publicId and timestamps are auto-generated by the ORM for SS collections
   */
  private async applyDefaults(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Standard Schema collections handle defaults through the schema (e.g., Zod .default())
    // Exceptions: publicId and createdAt are generated by the ORM
    if (isSSCollectionDefinition(this.collectionDef)) {
      const result = { ...data };
      const ssMeta = (this.collectionDef as unknown as SSCollectionDefinition<any>)._meta;
      
      // Generate publicId if configured and not already provided
      if (ssMeta.publicIdConfig) {
        const { prefix, field } = ssMeta.publicIdConfig;
        if (!(field in result) || result[field] === undefined) {
          result[field] = generatePublicId(prefix);
        }
      }

      // Set createdAt timestamp if timestamps are configured and not already provided
      if (ssMeta.timestampsConfig) {
        const { createdAt } = ssMeta.timestampsConfig;
        if (!(createdAt in result) || result[createdAt] === undefined) {
          result[createdAt] = new Date();
        }
      }
      
      return result;
    }

    const schema = this.collectionDef._schema;
    const result = { ...data };

    for (const [fieldName, fieldBuilder] of Object.entries(schema)) {
      const config = fieldBuilder._config;

      // Skip if value already provided
      if (fieldName in result && result[fieldName] !== undefined) {
        continue;
      }

      // Generate public ID
      if (config.isPublicId && config.publicIdConfig) {
        result[fieldName] = generatePublicId(config.publicIdConfig.prefix);
        continue;
      }

      // Apply default value
      if (config.defaultValue !== undefined) {
        const defaultVal = config.defaultValue;
        result[fieldName] =
          typeof defaultVal === 'function' ? await (defaultVal as any)() : defaultVal;
        continue;
      }

      // Apply defaultNow for dates
      if (config.defaultNow) {
        result[fieldName] = new Date();
        continue;
      }
    }

    return result;
  }

  /**
   * Apply update timestamps (onUpdateNow fields)
   * For Standard Schema collections with timestamps config, sets updatedAt field
   */
  private applyUpdateTimestamps(data: Record<string, unknown>): Record<string, unknown> {
    // Standard Schema collections use timestampsConfig for update timestamps
    if (isSSCollectionDefinition(this.collectionDef)) {
      const ssMeta = (this.collectionDef as unknown as SSCollectionDefinition<any>)._meta;
      
      if (ssMeta.timestampsConfig) {
        return {
          ...data,
          [ssMeta.timestampsConfig.updatedAt]: new Date(),
        };
      }
      
      return { ...data };
    }

    const schema = this.collectionDef._schema;
    const result = { ...data };

    for (const [fieldName, fieldBuilder] of Object.entries(schema)) {
      const config = fieldBuilder._config;

      if (config.onUpdateNow) {
        result[fieldName] = new Date();
      }
    }

    return result;
  }

  /**
   * Get the public ID field name if configured
   */
  private getPublicIdField(): string | null {
    // Check if this is a Standard Schema collection with publicId config
    if (isSSCollectionDefinition(this.collectionDef)) {
      const ssMeta = (this.collectionDef as unknown as SSCollectionDefinition<any>)._meta;
      return ssMeta.publicIdConfig?.field ?? null;
    }

    // For regular field-builder collections, check schema
    const schema = this.collectionDef._schema;
    for (const [fieldName, fieldBuilder] of Object.entries(schema)) {
      if (fieldBuilder._config.isPublicId) {
        return fieldName;
      }
    }
    return null;
  }

  /**
   * Get the soft delete field name if configured
   */
  private getSoftDeleteField(): string | null {
    // Check if this is a Standard Schema collection with softDelete config
    if (isSSCollectionDefinition(this.collectionDef)) {
      const ssMeta = (this.collectionDef as unknown as SSCollectionDefinition<any>)._meta;
      return ssMeta.softDeleteConfig?.field ?? null;
    }

    // For regular field-builder collections, check schema
    const schema = this.collectionDef._schema;
    for (const [fieldName, fieldBuilder] of Object.entries(schema)) {
      if (fieldBuilder._config.isSoftDeleteFlag) {
        return fieldName;
      }
    }
    return null;
  }

  /**
   * Propagate changes to documents that have embedded this source
   */
  private async propagateReverseEmbeds(
    updatedDoc: TDoc,
    updateData: Record<string, unknown>,
  ): Promise<void> {
    if (!this.reverseEmbedRegistry) {
      return;
    }

    const collectionName = this.collectionDef._meta.name;
    const targets = this.reverseEmbedRegistry.get(collectionName);

    if (!targets || targets.length === 0) {
      return;
    }

    for (const target of targets) {
      const { targetCollectionName, relationName, config } = target;

      // Check if we should propagate (watchFields logic)
      const shouldPropagate = this.shouldPropagateUpdate(config, updateData);
      if (!shouldPropagate) {
        continue;
      }

      // Check if async strategy is enabled
      const reverseConfig = config.reverse;
      const strategy = reverseConfig?.strategy || 'sync';

      if (strategy === 'async') {
        // Defer propagation using setTimeout (non-blocking)
        setTimeout(() => {
          this.executePropagation(updatedDoc, config, targetCollectionName, relationName).catch(
            (err) => {
              console.error('Error in async embed propagation:', err);
            },
          );
        }, 0);
      } else {
        // Execute synchronously
        await this.executePropagation(updatedDoc, config, targetCollectionName, relationName);
      }
    }
  }

  /**
   * Execute the actual propagation logic
   */
  private async executePropagation(
    updatedDoc: TDoc,
    config: any,
    targetCollectionName: string,
    relationName: string,
  ): Promise<void> {

      // Build new embedded data
      const embedIdField = config.embedIdField || '_id';
      const newEmbedData = this.extractFieldsForEmbed(
        updatedDoc as any,
        config.fields,
        embedIdField,
      );

      // Determine which field to search by (the ID that was embedded)
      const sourceIdValue = (updatedDoc as any)[embedIdField];
      const sourceIdString =
        sourceIdValue instanceof ObjectId
          ? sourceIdValue.toHexString()
          : String(sourceIdValue);

      // Update embedded field in target collection
      const targetCollection = this.db.collection(targetCollectionName);

      // Determine embed strategy from 'from' config
      const fromPath = config.from;
      const isInPlace = fromPath.includes('.'); // e.g., 'directory._id'
      const isArray = fromPath.endsWith('s') && !isInPlace; // heuristic: 'tagIds' vs 'tagId'

      if (isInPlace) {
        // In-place strategy: data merged into existing object
        // Extract base path: 'directory._id' → 'directory'
        const basePath = fromPath.substring(0, fromPath.lastIndexOf('.'));

        // For in-place embeds, the _id might be stored as ObjectId (not string)
        // Try both string and ObjectId in filter
        const filter = {
          $or: [
            { [`${basePath}._id`]: sourceIdString },
            { [`${basePath}._id`]: sourceIdValue },
          ],
        };

        // Build $set object with nested paths
        const updateFields: Record<string, any> = {};
        for (const [key, value] of Object.entries(newEmbedData)) {
          if (key !== '_id') {
            updateFields[`${basePath}.${key}`] = value;
          }
        }

        await targetCollection.updateMany(
          filter,
          { $set: updateFields },
          { session: this.ctx.session },
        );
      } else {
        // Separate or Array strategy: embed stored in relationName field
        const filter = {
          [`${relationName}._id`]: sourceIdString,
        };

        if (isArray) {
          // Array strategy: update specific element in array
          await targetCollection.updateMany(
            filter,
            {
              $set: {
                [`${relationName}.$[elem]`]: newEmbedData,
              },
            },
            {
              arrayFilters: [{ 'elem._id': sourceIdString }],
              session: this.ctx.session,
            } as any,
          );
        } else {
          // Separate strategy: replace entire embed
          await targetCollection.updateMany(
            filter,
            { $set: { [relationName]: newEmbedData } },
            { session: this.ctx.session },
          );
        }
      }
  }

  /**
   * Check if update should be propagated based on watchFields
   */
  private shouldPropagateUpdate(
    config: any,
    updateData: Record<string, unknown>,
  ): boolean {
    const reverseConfig = config.reverse;

    // If no watchFields specified, always propagate
    if (!reverseConfig?.watchFields || reverseConfig.watchFields.length === 0) {
      return true;
    }

    // Check if any of the updated fields are in watchFields
    const updatedFields = Object.keys(updateData);
    const watchFields = reverseConfig.watchFields;

    return updatedFields.some((field) => watchFields.includes(field));
  }

  /**
   * Extract specified fields from document for embedding
   * ALWAYS includes the ID field from embedIdField config
   */
  private extractFieldsForEmbed(
    doc: Document,
    fields: string[] | Record<string, 1 | 0>,
    embedIdField: string = '_id',
  ): Document {
    if (Array.isArray(fields)) {
      const result: Document = {};

      // Always include the ID field first (convert to string)
      if (embedIdField in doc) {
        const idValue = doc[embedIdField];
        result._id = idValue instanceof ObjectId ? idValue.toHexString() : String(idValue);
      }

      for (const field of fields) {
        if (field in doc && field !== embedIdField) {
          result[field] = doc[field];
        }
      }
      return result;
    } else {
      // Projection syntax
      const result: Document = {};

      // Always include the ID field unless explicitly excluded (convert to string)
      if (fields._id !== 0 && embedIdField in doc) {
        const idValue = doc[embedIdField];
        result._id = idValue instanceof ObjectId ? idValue.toHexString() : String(idValue);
      }

      for (const [field, include] of Object.entries(fields)) {
        if (include === 1 && field in doc && field !== embedIdField) {
          result[field] = doc[field];
        }
      }
      return result;
    }
  }

  /**
   * Handle delete cascades when a source document is deleted
   */
  private async handleDeleteCascades(deletedDoc: TDoc): Promise<void> {
    if (!this.deleteRegistry) {
      return;
    }

    const collectionName = this.collectionDef._meta.name;
    const targets = this.deleteRegistry.get(collectionName);

    if (!targets || targets.length === 0) {
      return;
    }

    for (const target of targets) {
      const { targetCollectionName, relationName, config, deleteAction } = target;

      const embedIdField = config.embedIdField || '_id';
      const sourceIdValue = (deletedDoc as any)[embedIdField];
      const sourceIdString =
        sourceIdValue instanceof ObjectId
          ? sourceIdValue.toHexString()
          : String(sourceIdValue);

      const targetCollection = this.db.collection(targetCollectionName);

      // Determine embed strategy from 'from' config
      const fromPath = config.from;
      const isInPlace = fromPath.includes('.'); // e.g., 'directory._id'
      const isArray = fromPath.endsWith('s') && !isInPlace;

      if (deleteAction === 'cascade') {
        // Delete entire document
        if (isInPlace) {
          const basePath = fromPath.substring(0, fromPath.lastIndexOf('.'));
          await targetCollection.deleteMany(
            {
              $or: [
                { [`${basePath}._id`]: sourceIdString },
                { [`${basePath}._id`]: sourceIdValue },
              ],
            },
            { session: this.ctx.session },
          );
        } else if (isArray) {
          // Array embeds: delete documents containing this embed in array
          await targetCollection.deleteMany(
            { [`${relationName}._id`]: sourceIdString },
            { session: this.ctx.session },
          );
        } else {
          // Separate strategy
          await targetCollection.deleteMany(
            { [`${relationName}._id`]: sourceIdString },
            { session: this.ctx.session },
          );
        }
      } else if (deleteAction === 'nullify') {
        // Set both embed and reference to null
        if (isInPlace) {
          const basePath = fromPath.substring(0, fromPath.lastIndexOf('.'));
          await targetCollection.updateMany(
            {
              $or: [
                { [`${basePath}._id`]: sourceIdString },
                { [`${basePath}._id`]: sourceIdValue },
              ],
            },
            {
              $set: {
                [basePath]: null,
              },
            },
            { session: this.ctx.session },
          );
        } else if (isArray) {
          // Array embeds: remove the specific embed from array and nullify reference
          const refField = fromPath; // e.g., 'tagIds'
          // Remove from embed array
          await targetCollection.updateMany(
            { [`${relationName}._id`]: sourceIdString },
            {
              $pull: { [relationName]: { _id: sourceIdString } } as any,
            },
            { session: this.ctx.session },
          );
          // Remove from reference array
          await targetCollection.updateMany(
            { [refField]: sourceIdValue },
            {
              $pull: { [refField]: sourceIdValue } as any,
            },
            { session: this.ctx.session },
          );
        } else {
          // Separate strategy: nullify both embed and reference
          const refField = fromPath; // e.g., 'authorId'
          await targetCollection.updateMany(
            { [`${relationName}._id`]: sourceIdString },
            {
              $set: {
                [relationName]: null,
                [refField]: null,
              },
            },
            { session: this.ctx.session },
          );
        }
      } else if (deleteAction === 'clear') {
        // Clear embed but keep reference
        if (isInPlace) {
          const basePath = fromPath.substring(0, fromPath.lastIndexOf('.'));
          // Clear all fields except _id in the nested object
          const unsetFields: Record<string, any> = {};
          for (const field of config.fields) {
            unsetFields[`${basePath}.${field}`] = '';
          }
          await targetCollection.updateMany(
            {
              $or: [
                { [`${basePath}._id`]: sourceIdString },
                { [`${basePath}._id`]: sourceIdValue },
              ],
            },
            {
              $unset: unsetFields,
            },
            { session: this.ctx.session },
          );
        } else if (isArray) {
          // Array embeds: remove from embed array but keep in reference array
          await targetCollection.updateMany(
            { [`${relationName}._id`]: sourceIdString },
            {
              $pull: { [relationName]: { _id: sourceIdString } } as any,
            },
            { session: this.ctx.session },
          );
        } else {
          // Separate strategy: nullify embed but keep reference
          await targetCollection.updateMany(
            { [`${relationName}._id`]: sourceIdString },
            {
              $set: {
                [relationName]: null,
              },
            },
            { session: this.ctx.session },
          );
        }
      }
    }
  }

  /**
   * Refresh embeds in documents (query-time, read-only)
   * Re-fetches specified embed relations with fresh data from source
   */
  private async refreshEmbedsInDocuments(
    docs: TDoc[],
    relationNames: string[],
  ): Promise<TDoc[]> {
    if (docs.length === 0) return docs;

    const relations = this.collectionDef._meta.relations || {};

    for (const relationName of relationNames) {
      const relation = relations[relationName];
      if (!relation || relation.type !== 'embed') {
        continue; // Skip non-embed relations
      }

      const embedRelation = relation as any;
      const config = embedRelation.forward;
      if (!config) continue;

      // Re-process forward embeds for these documents
      docs = await Promise.all(
        docs.map(async (doc) => {
          return (await this.relationHelper.processForwardEmbeds(
            doc as any,
            [relationName],
          )) as TDoc;
        }),
      );
    }

    return docs;
  }

  /**
   * Manual batch refresh of embeds (persists updates to database)
   * Useful for maintenance, migrations, or fixing stale data
   */
  async refreshEmbeds(
    relationName: string,
    options: {
      filter?: Filter<TDoc>;
      batchSize?: number;
      dryRun?: boolean;
    } = {},
  ): Promise<{ matched: number; updated: number; errors: number; skipped: number }> {
    const { filter = {}, batchSize = 100, dryRun = false } = options;

    const relations = this.collectionDef._meta.relations || {};
    const relation = relations[relationName];

    if (!relation || relation.type !== 'embed') {
      throw new Error(`Relation '${relationName}' is not an EMBED relation`);
    }

    const embedRelation = relation as any;
    const config = embedRelation.forward;
    if (!config) {
      throw new Error(`Relation '${relationName}' does not have forward embed config`);
    }

    const stats = {
      matched: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
    };

    const finalFilter = this.applyPolicies(filter);

    // Count total documents
    stats.matched = await this.collection.countDocuments(finalFilter, {
      session: this.ctx.session,
    });

    if (stats.matched === 0) {
      return stats;
    }

    // Process in batches
    let skip = 0;
    while (skip < stats.matched) {
      const batch = await this.collection
        .find(finalFilter, { session: this.ctx.session })
        .skip(skip)
        .limit(batchSize)
        .toArray();

      for (const doc of batch) {
        try {
          // Re-process forward embed for this document
          const refreshedDoc = await this.relationHelper.processForwardEmbeds(
            doc as any,
            [relationName],
          );

          // Update the document if not in dry-run mode
          if (!dryRun) {
            await this.collection.updateOne(
              { _id: doc._id } as Filter<TDoc>,
              { $set: { [relationName]: (refreshedDoc as any)[relationName] } } as any,
              { session: this.ctx.session },
            );
          }

          stats.updated++;
        } catch (error) {
          stats.errors++;
          console.error(`Error refreshing embed for document ${doc._id}:`, error);
        }
      }

      skip += batchSize;
    }

    return stats;
  }
}
