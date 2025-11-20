/**
 * Basic schema definition example
 */

import {
  mongoCollection,
  objectId,
  publicId,
  string,
  boolean,
  date,
  array,
  json,
} from '../src/index';
import type { InferDocument, InferInsert, InferUpdate } from '../src/index';

// Define a users collection
export const users = mongoCollection(
  'users',
  {
    _id: objectId().internalId(),
    id: publicId('user'),

    orgId: objectId().index(),

    email: string()
      .email()
      .min(3)
      .max(255)
      .unique()
      .index()
      .search({ type: 'text', analyzer: 'email' }),

    displayName: string().min(1).max(100),

    role: string().enum(['user', 'admin']).default('user'),
    isActive: boolean().default(true),

    passwordHash: string().audit({ redact: 'hash' }),

    createdAt: date().defaultNow(),
    updatedAt: date().defaultNow().onUpdateNow(),
    deletedAt: date().nullable().softDeleteFlag(),

    tags: array(string()).optional(),
    metadata: json<Record<string, unknown>>().optional(),
  },
  {
    policies: {
      readFilter: (ctx) => ({
        orgId: ctx.tenantIdObjectId,
        deletedAt: null,
      }),
      writeFilter: (ctx) => ({
        orgId: ctx.tenantIdObjectId,
      }),
    },

    audit: {
      enabled: true,
      logReads: true,
      logWrites: true,
      redact: {
        passwordHash: 'hash',
      },
    },

    hooks: {
      beforeInsert: async (_ctx, doc) => {
        console.log('Creating user:', doc.email);
        return doc;
      },
      afterInsert: async (_ctx, doc) => {
        console.log('User created:', doc.id);
      },
    },
  },
);

// Type inference
export type User = InferDocument<typeof users>;
export type NewUser = InferInsert<typeof users>;
export type UpdateUser = InferUpdate<typeof users>;

// Example usage
console.log('Schema definition test passed!');
console.log('Collection:', users._meta.name);
console.log('Indexes:', users._meta.indexes.length);
