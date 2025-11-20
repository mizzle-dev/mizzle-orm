/**
 * Example demonstrating CRUD operations with Mizzle ORM
 */

import {
  createMongoOrm,
  mongoCollection,
  objectId,
  publicId,
  string,
  boolean,
  date,
  array,
} from '../src/index';
import type { InferDocument, InferInsert } from '../src/index';

// Define collections
const users = mongoCollection(
  'users',
  {
    _id: objectId().internalId(),
    id: publicId('user'),
    orgId: objectId().index(),
    email: string().email().unique().index(),
    displayName: string().min(1).max(100),
    role: string().enum(['user', 'admin']).default('user'),
    isActive: boolean().default(true),
    createdAt: date().defaultNow(),
    updatedAt: date().defaultNow().onUpdateNow(),
    deletedAt: date().nullable().softDeleteFlag(),
    tags: array(string()).optional(),
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
      canUpdate: (ctx, oldDoc, _newDoc) => {
        // Only admins or document owner can update
        return ctx.user?.roles?.includes('admin') || oldDoc.id === ctx.user?.id;
      },
      canDelete: (ctx) => {
        // Only admins can delete
        return ctx.user?.roles?.includes('admin') === true;
      },
    },
    hooks: {
      beforeInsert: async (ctx, doc) => {
        console.log(`[${ctx.requestId}] Creating user:`, doc.email);
        return doc;
      },
      afterInsert: async (ctx, doc) => {
        console.log(`[${ctx.requestId}] User created:`, doc.id);
      },
      afterUpdate: async (ctx, _oldDoc, newDoc) => {
        console.log(`[${ctx.requestId}] User updated:`, newDoc.id);
      },
    },
  },
);

const projects = mongoCollection(
  'projects',
  {
    _id: objectId().internalId(),
    id: publicId('proj'),
    orgId: objectId().index(),
    ownerId: string().index(),
    name: string().min(1).max(200),
    description: string().optional(),
    status: string().enum(['draft', 'active', 'archived']).default('draft'),
    createdAt: date().defaultNow(),
    updatedAt: date().defaultNow().onUpdateNow(),
  },
  {
    policies: {
      readFilter: (ctx) => ({
        orgId: ctx.tenantIdObjectId,
      }),
    },
  },
);

// Types
type User = InferDocument<typeof users>;
type NewUser = InferInsert<typeof users>;

/**
 * Example usage
 */
async function main() {
  // This would normally come from environment variables
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

  // Create ORM instance
  const orm = await createMongoOrm({
    uri: MONGO_URI,
    dbName: 'mizzle_example',
    collections: [users, projects],
  });

  console.log('✓ Connected to MongoDB');

  // Create a context (typically per-request in a web app)
  const ctx = orm.createContext({
    user: {
      id: 'user_admin123',
      email: 'admin@example.com',
      roles: ['admin'],
    },
    tenantId: '507f1f77bcf86cd799439011', // Example ObjectId
  });

  // Get context-bound database facade
  const db = orm.withContext(ctx);

  // ========== CREATE ==========
  console.log('\n--- CREATE ---');

  const newUser: NewUser = {
    orgId: ctx.tenantIdObjectId!,
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    tags: ['developer', 'typescript'],
  };

  const alice = await db.users.create(newUser);
  console.log('Created user:', alice.id, alice.email);

  const bob = await db.users.create({
    orgId: ctx.tenantIdObjectId!,
    email: 'bob@example.com',
    displayName: 'Bob Johnson',
    role: 'admin',
  });
  console.log('Created admin:', bob.id, bob.email);

  // ========== READ ==========
  console.log('\n--- READ ---');

  // Find by public ID
  const foundAlice = await db.users.findById(alice.id);
  console.log('Found by public ID:', foundAlice?.displayName);

  // Find by MongoDB _id
  const foundBob = await db.users.findById(bob._id);
  console.log('Found by _id:', foundBob?.displayName);

  // Find one with filter
  const adminUser = await db.users.findOne({ role: 'admin' });
  console.log('Found admin:', adminUser?.email);

  // Find many with pagination
  const allUsers = await db.users.findMany(
    { isActive: true },
    { sort: { createdAt: -1 }, limit: 10 },
  );
  console.log(`Found ${allUsers.length} active users`);

  // Count
  const userCount = await db.users.count({ isActive: true });
  console.log(`Total active users: ${userCount}`);

  // ========== UPDATE ==========
  console.log('\n--- UPDATE ---');

  const updatedAlice = await db.users.updateById(alice.id, {
    displayName: 'Alice M. Smith',
    tags: ['developer', 'typescript', 'mongodb'],
  });
  console.log('Updated user:', updatedAlice?.displayName);
  console.log('Updated timestamp changed:', updatedAlice?.updatedAt > alice.updatedAt);

  // Update many
  const updated = await db.users.updateMany({ role: 'user' }, { isActive: true });
  console.log(`Updated ${updated} users`);

  // ========== SOFT DELETE ==========
  console.log('\n--- SOFT DELETE ---');

  const softDeleted = await db.users.softDelete(alice.id);
  console.log('Soft deleted user:', softDeleted?.deletedAt ? 'yes' : 'no');

  // Verify user is excluded from queries (due to policy)
  const shouldBeNull = await db.users.findById(alice.id);
  console.log('User findable after soft delete:', shouldBeNull ? 'yes' : 'no');

  // Restore
  const restored = await db.users.restore(alice.id);
  console.log('Restored user:', restored?.deletedAt === null ? 'yes' : 'no');

  // ========== DELETE ==========
  console.log('\n--- DELETE ---');

  // Create a temp user to delete
  const temp = await db.users.create({
    orgId: ctx.tenantIdObjectId!,
    email: 'temp@example.com',
    displayName: 'Temporary User',
  });

  const deleted = await db.users.deleteById(temp.id);
  console.log('Deleted user:', deleted ? 'yes' : 'no');

  // ========== AGGREGATION ==========
  console.log('\n--- AGGREGATION ---');

  const usersByRole = await db.users.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log('Users by role:', usersByRole);

  // ========== RAW ACCESS ==========
  console.log('\n--- RAW ACCESS ---');

  const rawCollection = db.users.rawCollection();
  const rawCount = await rawCollection.countDocuments();
  console.log('Raw count (bypasses policies):', rawCount);

  const rawClient = orm.rawClient();
  console.log('MongoDB client version:', rawClient.options);

  // ========== CLEANUP ==========
  await orm.close();
  console.log('\n✓ Disconnected from MongoDB');
}

// Run example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { users, projects };
