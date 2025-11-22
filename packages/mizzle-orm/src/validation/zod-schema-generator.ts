/**
 * Zod schema generation from field definitions
 */

import { z } from 'zod';
import type { SchemaDefinition, FieldConfig, AnyFieldBuilder } from '../types/field';
import { FieldType } from '../types/field';
import { ObjectId } from 'mongodb';

/**
 * Generate a Zod schema from a field configuration
 */
function fieldConfigToZod(fieldConfig: FieldConfig<any>): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  // Base type
  switch (fieldConfig.type) {
    case FieldType.STRING:
    case FieldType.PUBLIC_ID:
      schema = z.string();

      // String validations
      if (fieldConfig.stringConfig) {
        const cfg = fieldConfig.stringConfig;
        if (cfg.min !== undefined) schema = (schema as z.ZodString).min(cfg.min);
        if (cfg.max !== undefined) schema = (schema as z.ZodString).max(cfg.max);
        if (cfg.pattern) schema = (schema as z.ZodString).regex(cfg.pattern);
        if (cfg.email) schema = (schema as z.ZodString).email();
        if (cfg.url) schema = (schema as z.ZodString).url();
        if (cfg.uuid) schema = (schema as z.ZodString).uuid();
      }
      break;

    case FieldType.NUMBER:
      schema = z.number();

      // Number validations
      if (fieldConfig.numberConfig) {
        const cfg = fieldConfig.numberConfig;
        if (cfg.min !== undefined) schema = (schema as z.ZodNumber).min(cfg.min);
        if (cfg.max !== undefined) schema = (schema as z.ZodNumber).max(cfg.max);
        if (cfg.int) schema = (schema as z.ZodNumber).int();
        if (cfg.positive) schema = (schema as z.ZodNumber).positive();
      }
      break;

    case FieldType.BOOLEAN:
      schema = z.boolean();
      break;

    case FieldType.DATE:
      schema = z.date();
      break;

    case FieldType.OBJECT_ID:
      // Custom validator for ObjectId
      schema = z.custom<ObjectId>(
        (val) => val instanceof ObjectId,
        'Must be a valid ObjectId'
      );
      break;

    case FieldType.ARRAY:
      if (fieldConfig.arrayConfig?.itemField) {
        const itemSchema = fieldConfigToZod(fieldConfig.arrayConfig.itemField);
        schema = z.array(itemSchema);

        if (fieldConfig.arrayConfig.min !== undefined) {
          schema = (schema as z.ZodArray<any>).min(fieldConfig.arrayConfig.min);
        }
        if (fieldConfig.arrayConfig.max !== undefined) {
          schema = (schema as z.ZodArray<any>).max(fieldConfig.arrayConfig.max);
        }
      } else {
        schema = z.array(z.any());
      }
      break;

    case FieldType.RECORD:
      // Record/map type
      schema = z.record(z.string(), z.any());
      break;

    case FieldType.JSON:
      // Any JSON value
      schema = z.any();
      break;

    case FieldType.BINARY:
      // Buffer or Uint8Array
      schema = z.instanceof(Buffer).or(z.instanceof(Uint8Array));
      break;

    case FieldType.DECIMAL:
      // MongoDB Decimal128 - validate as object
      schema = z.object({
        bytes: z.instanceof(Buffer),
      });
      break;

    case FieldType.GEO_POINT:
      // GeoJSON Point
      schema = z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
      });
      break;

    default:
      schema = z.any();
  }

  // Apply optional/nullable
  if (fieldConfig.optional) {
    schema = schema.optional();
  }
  if (fieldConfig.nullable) {
    schema = schema.nullable();
  }

  // Apply default value (if any)
  if (fieldConfig.defaultValue !== undefined) {
    const defaultVal = fieldConfig.defaultValue;
    schema = schema.default(typeof defaultVal === 'function' ? defaultVal() : defaultVal);
  }

  return schema;
}

/**
 * Generate a Zod schema for document validation
 */
export function generateDocumentSchema(schemaDef: SchemaDefinition): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [fieldName, fieldBuilder] of Object.entries(schemaDef)) {
    const anyBuilder = fieldBuilder as AnyFieldBuilder;
    shape[fieldName] = fieldConfigToZod(anyBuilder._config);
  }

  return z.object(shape);
}

/**
 * Generate a Zod schema for insert data (excludes auto-generated fields)
 */
export function generateInsertSchema(schemaDef: SchemaDefinition): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [fieldName, fieldBuilder] of Object.entries(schemaDef)) {
    const anyBuilder = fieldBuilder as AnyFieldBuilder;
    const config = anyBuilder._config;

    // Skip auto-generated fields
    if (
      config.isPublicId ||
      config.isInternalId ||
      config.defaultNow ||
      config.onUpdateNow
    ) {
      continue;
    }

    shape[fieldName] = fieldConfigToZod(config);
  }

  return z.object(shape).partial();
}

/**
 * Generate a Zod schema for update data (all fields optional)
 */
export function generateUpdateSchema(schemaDef: SchemaDefinition): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [fieldName, fieldBuilder] of Object.entries(schemaDef)) {
    const anyBuilder = fieldBuilder as AnyFieldBuilder;
    const config = anyBuilder._config;

    // Skip auto-managed fields
    if (config.isPublicId || config.isInternalId || config.onUpdateNow) {
      continue;
    }

    shape[fieldName] = fieldConfigToZod(config).optional();
  }

  return z.object(shape).partial();
}
