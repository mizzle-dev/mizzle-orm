/**
 * Field builder tests
 */

import { describe, it, expect } from 'vitest';
import {
  string,
  number,
  boolean,
  date,
  objectId,
  publicId,
  array,
  record,
  json,
  binary,
  decimal,
  geoPoint,
} from '../fields';
import { FieldType } from '../../types/field';

describe('Field Builders', () => {
  describe('string()', () => {
    it('should create a string field', () => {
      const field = string();
      expect(field._config.type).toBe(FieldType.STRING);
      expect(field._config.optional).toBe(false);
    });

    it('should support optional()', () => {
      const field = string().optional();
      expect(field._config.optional).toBe(true);
    });

    it('should support nullable()', () => {
      const field = string().nullable();
      expect(field._config.nullable).toBe(true);
    });

    it('should support default value', () => {
      const field = string().default('hello');
      expect(field._config.defaultValue).toBe('hello');
    });

    it('should support min/max length', () => {
      const field = string().min(5).max(100);
      expect(field._config.stringConfig?.min).toBe(5);
      expect(field._config.stringConfig?.max).toBe(100);
    });

    it('should support length', () => {
      const field = string().length(10);
      expect(field._config.stringConfig?.min).toBe(10);
      expect(field._config.stringConfig?.max).toBe(10);
    });

    it('should support regex pattern', () => {
      const pattern = /^[a-z]+$/;
      const field = string().pattern(pattern);
      expect(field._config.stringConfig?.pattern).toBe(pattern);
    });

    it('should support email validation', () => {
      const field = string().email();
      expect(field._config.stringConfig?.email).toBe(true);
    });

    it('should support url validation', () => {
      const field = string().url();
      expect(field._config.stringConfig?.url).toBe(true);
    });

    it('should support uuid validation', () => {
      const field = string().uuid();
      expect(field._config.stringConfig?.uuid).toBe(true);
    });

    it('should support unique index', () => {
      const field = string().unique();
      expect(field._config.index?.unique).toBe(true);
    });
  });

  describe('number()', () => {
    it('should create a number field', () => {
      const field = number();
      expect(field._config.type).toBe(FieldType.NUMBER);
    });

    it('should support min/max', () => {
      const field = number().min(0).max(100);
      expect(field._config.numberConfig?.min).toBe(0);
      expect(field._config.numberConfig?.max).toBe(100);
    });

    it('should support int validation', () => {
      const field = number().int();
      expect(field._config.numberConfig?.int).toBe(true);
    });

    it('should support positive', () => {
      const field = number().positive();
      expect(field._config.numberConfig?.positive).toBe(true);
    });
  });

  describe('boolean()', () => {
    it('should create a boolean field', () => {
      const field = boolean();
      expect(field._config.type).toBe(FieldType.BOOLEAN);
    });

    it('should support default value', () => {
      const field = boolean().default(true);
      expect(field._config.defaultValue).toBe(true);
    });
  });

  describe('date()', () => {
    it('should create a date field', () => {
      const field = date();
      expect(field._config.type).toBe(FieldType.DATE);
    });

    it('should support defaultNow', () => {
      const field = date().defaultNow();
      expect(field._config.defaultNow).toBe(true);
    });

    it('should support onUpdateNow', () => {
      const field = date().onUpdateNow();
      expect(field._config.onUpdateNow).toBe(true);
    });

    it('should support soft delete flag', () => {
      const field = date().softDeleteFlag();
      expect(field._config.isSoftDeleteFlag).toBe(true);
    });
  });

  describe('objectId()', () => {
    it('should create an objectId field', () => {
      const field = objectId();
      expect(field._config.type).toBe(FieldType.OBJECT_ID);
    });

    it('should support internalId', () => {
      const field = objectId().internalId();
      expect(field._config.isInternalId).toBe(true);
    });
  });

  describe('publicId()', () => {
    it('should create a public ID field with prefix', () => {
      const field = publicId('user');
      expect(field._config.type).toBe(FieldType.PUBLIC_ID);
      expect(field._config.isPublicId).toBe(true);
      expect(field._config.publicIdConfig?.prefix).toBe('user');
    });

    it('should support unique constraint', () => {
      const field = publicId('test').unique();
      expect(field._config.index?.unique).toBe(true);
    });
  });

  describe('array()', () => {
    it('should create an array field', () => {
      const field = array(string());
      expect(field._config.type).toBe(FieldType.ARRAY);
    });

    it('should support min/max length', () => {
      const field = array(number()).min(1).max(10);
      expect(field._config.arrayConfig?.min).toBe(1);
      expect(field._config.arrayConfig?.max).toBe(10);
    });
  });

  describe('record()', () => {
    it('should create a record field', () => {
      const field = record(string(), number());
      expect(field._config.type).toBe(FieldType.RECORD);
    });
  });

  describe('json()', () => {
    it('should create a json field', () => {
      const field = json();
      expect(field._config.type).toBe(FieldType.JSON);
    });
  });

  describe('binary()', () => {
    it('should create a binary field', () => {
      const field = binary();
      expect(field._config.type).toBe(FieldType.BINARY);
    });
  });

  describe('decimal()', () => {
    it('should create a decimal field', () => {
      const field = decimal();
      expect(field._config.type).toBe(FieldType.DECIMAL);
    });
  });

  describe('geoPoint()', () => {
    it('should create a geoPoint field', () => {
      const field = geoPoint();
      expect(field._config.type).toBe(FieldType.GEO_POINT);
    });
  });
});
