/**
 * Mizzle API Example - S+ Tier DX
 *
 * This example demonstrates the new mizzle() API with:
 * - Callable database instance: db({ context })
 * - Perfect type inference for nested includes
 * - Transaction support
 * - Clean, Drizzle-inspired design
 */

import { mongoCollection, defineSchema, mizzle } from '../src';
import { string, objectId, number, date, boolean } from '../src/schema/fields';
import { lookup } from '../src/collection/relations';

// ============================================================
// 1. Define your schema
// ============================================================

const organizations = mongoCollection('organizations', {
  name: string(),
  slug: string(),
  website: string().optional(),
  createdAt: date(),
});

const users = mongoCollection(
  'users',
  {
    name: string(),
    email: string(),
    role: string(), // 'admin' | 'member' | 'viewer'
    organizationId: objectId(),
    createdAt: date(),
    isActive: boolean(),
  },
  {
    relations: {
      organization: lookup(organizations, {
        localField: 'organizationId',
        foreignField: '_id',
        one: true,
      }),
    },
  }
);

const projects = mongoCollection(
  'projects',
  {
    name: string(),
    description: string().optional(),
    organizationId: objectId(),
    ownerId: objectId(),
    status: string(), // 'active' | 'archived' | 'completed'
    createdAt: date(),
  },
  {
    relations: {
      organization: lookup(organizations, {
        localField: 'organizationId',
        foreignField: '_id',
        one: true,
      }),
      owner: lookup(users, {
        localField: 'ownerId',
        foreignField: '_id',
        one: true,
      }),
    },
  }
);

const tasks = mongoCollection(
  'tasks',
  {
    title: string(),
    description: string().optional(),
    projectId: objectId(),
    assigneeId: objectId().optional(),
    status: string(), // 'todo' | 'in_progress' | 'done'
    priority: number(),
    dueDate: date().optional(),
    createdAt: date(),
  },
  {
    relations: {
      project: lookup(projects, {
        localField: 'projectId',
        foreignField: '_id',
        one: true,
      }),
      assignee: lookup(users, {
        localField: 'assigneeId',
        foreignField: '_id',
        one: true,
      }),
    },
  }
);

// ============================================================
// 2. Create schema with perfect type inference
// ============================================================

const schema = defineSchema({
  organizations,
  users,
  projects,
  tasks,
});

// ============================================================
// 3. Initialize Mizzle database
// ============================================================

async function main() {
  // Create the database instance
  const db = await mizzle({
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: 'mizzle_example',
    schema,
  });

  try {
    // ============================================================
    // 4. Basic CRUD with context
    // ============================================================

    // Create an organization
    const org = await db().organizations.create({
      name: 'Acme Corp',
      slug: 'acme',
      website: 'https://acme.com',
      createdAt: new Date(),
    });

    console.log('Created organization:', org.name);

    // Create a user with context
    const currentUser = { id: 'admin-123', role: 'admin' };
    const user = await db({ user: currentUser }).users.create({
      name: 'Alice Johnson',
      email: 'alice@acme.com',
      role: 'admin',
      organizationId: org._id,
      createdAt: new Date(),
      isActive: true,
    });

    console.log('Created user:', user.name);

    // ============================================================
    // 5. Perfect type inference with nested includes
    // ============================================================

    // Create a project and task
    const project = await db().projects.create({
      name: 'Website Redesign',
      description: 'Modernize the company website',
      organizationId: org._id,
      ownerId: user._id,
      status: 'active',
      createdAt: new Date(),
    });

    await db().tasks.create({
      title: 'Design new homepage',
      description: 'Create mockups for the new homepage design',
      projectId: project._id,
      assigneeId: user._id,
      status: 'in_progress',
      priority: 1,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      createdAt: new Date(),
    });

    // Query with 3-level nested includes - fully typed!
    const tasks = await db().tasks.findMany(
      { status: 'in_progress' },
      {
        include: {
          project: {
            include: {
              organization: true,
              owner: true,
            },
          },
          assignee: {
            include: {
              organization: true,
            },
          },
        },
      }
    );

    // TypeScript knows the exact shape of the result
    for (const t of tasks) {
      console.log('\nTask:', t.title);
      console.log('├─ Project:', t.project?.name);
      console.log('│  ├─ Organization:', t.project?.organization?.name);
      console.log('│  └─ Owner:', t.project?.owner?.name);
      console.log('└─ Assignee:', t.assignee?.name);
      console.log('   └─ Organization:', t.assignee?.organization?.name);

      // Perfect type inference - these are all typed!
      const taskTitle: string = t.title; // ✅ string
      const projectName: string | undefined = t.project?.name; // ✅ string | undefined
      const orgName: string | undefined = t.project?.organization?.name; // ✅ string | undefined
      const assigneeName: string | undefined = t.assignee?.name; // ✅ string | undefined

      // TypeScript will error on wrong types
      // const wrong: number = t.title; // ❌ Type error!

      console.log({ taskTitle, projectName, orgName, assigneeName });
    }

    // ============================================================
    // 6. Transactions
    // ============================================================

    await db.tx({}, async (txDb) => {
      // Create a new project and task atomically
      const newProject = await txDb().projects.create({
        name: 'Mobile App',
        description: 'Build a mobile app',
        organizationId: org._id,
        ownerId: user._id,
        status: 'active',
        createdAt: new Date(),
      });

      const newTask = await txDb().tasks.create({
        title: 'Setup React Native project',
        projectId: newProject._id,
        assigneeId: user._id,
        status: 'todo',
        priority: 1,
        createdAt: new Date(),
      });

      console.log('\nCreated in transaction:');
      console.log('├─ Project:', newProject.name);
      console.log('└─ Task:', newTask.title);

      // Both are committed atomically
    });

    // ============================================================
    // 7. Access utilities
    // ============================================================

    // Access schema metadata
    console.log('\nSchema collections:', Object.keys(db.schema));

    // Access raw MongoDB client
    const collections = await db.client.db().listCollections().toArray();
    console.log('MongoDB collections:', collections.map((c) => c.name));

    // Check connection
    await db.client.db().admin().ping();
    console.log('Database connected ✓');

    // ============================================================
    // 8. Advanced queries with context
    // ============================================================

    // Simulate multi-tenant context
    const tenantContext = {
      user: { id: user._id.toString(), role: 'admin' },
      tenantId: org._id.toString(),
    };

    // Query with tenant context
    const tenantProjects = await db(tenantContext).projects.findMany(
      { organizationId: org._id },
      {
        include: {
          owner: true,
        },
      }
    );

    console.log(`\nFound ${tenantProjects.length} projects for tenant`);
    for (const p of tenantProjects) {
      console.log(`├─ ${p.name} (owner: ${p.owner?.name})`);
    }

    // ============================================================
    // 9. Query with includes
    // ============================================================

    // Fetch tasks with assignees
    const lightweightTasks = await db().tasks.findMany(
      {},
      {
        include: {
          assignee: true,
        },
      }
    );

    console.log('\nTasks with assignees:');
    for (const t of lightweightTasks) {
      console.log(`├─ ${t.title} [${t.status}] (${t.assignee?.name})`);
    }

    // ============================================================
    // 10. Complex filtering and sorting
    // ============================================================

    const urgentTasks = await db().tasks.findMany(
      {
        status: { $in: ['todo', 'in_progress'] },
        priority: { $gte: 1 },
        dueDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      {
        sort: { priority: -1, dueDate: 1 },
        limit: 10,
        include: {
          project: true,
          assignee: true,
        },
      }
    );

    console.log(`\nFound ${urgentTasks.length} urgent tasks:`);
    for (const t of urgentTasks) {
      console.log(`├─ [P${t.priority}] ${t.title}`);
      console.log(`│  ├─ Project: ${t.project?.name}`);
      console.log(`│  ├─ Assignee: ${t.assignee?.name}`);
      console.log(`│  └─ Due: ${t.dueDate?.toLocaleDateString()}`);
    }

    // ============================================================
    // 11. Bulk operations
    // ============================================================

    const updatedCount = await db().tasks.updateMany({ status: 'done' }, { priority: 0 });

    console.log(`\nUpdated ${updatedCount} completed tasks`);

    // ============================================================
    // 12. Aggregations
    // ============================================================

    // For MongoDB aggregations, use rawCollection() to access the native driver
    const stats = await db()
      .tasks.rawCollection()
      .aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgPriority: { $avg: '$priority' },
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    console.log('\nTask statistics:');
    for (const stat of stats) {
      console.log(`├─ ${stat._id}: ${stat.count} tasks (avg priority: ${stat.avgPriority.toFixed(1)})`);
    }
  } finally {
    // ============================================================
    // 13. Cleanup
    // ============================================================
    await db.close();
    console.log('\n✓ Database connection closed');
  }
}

// ============================================================
// Run the example
// ============================================================

main().catch(console.error);

// ============================================================
// Type Examples - Perfect Inference
// ============================================================

/**
 * The new Mizzle API provides perfect type inference:
 *
 * 1. Schema is fully typed:
 *    const schema = defineSchema({ users, posts, comments });
 *    type Schema = typeof schema; // ✅ Preserves exact types
 *
 * 2. Database instance is callable and typed:
 *    const db = await mizzle({ uri, dbName, schema });
 *    type DB = typeof db; // ✅ Mizzle<typeof schema>
 *
 * 3. Collection methods are fully typed:
 *    const user = await db().users.findOne({ email: '...' });
 *    type User = typeof user; // ✅ InferDocument<typeof users>
 *
 * 4. Nested includes are perfectly typed:
 *    const posts = await db().posts.findMany({}, {
 *      include: {
 *        author: {
 *          include: { organization: true }
 *        }
 *      }
 *    });
 *    type Post = typeof posts[0];
 *    type Author = Post['author']; // ✅ User | null
 *    type Org = Author['organization']; // ✅ Organization | null
 *
 * 5. Context is properly typed:
 *    db({ user: { id: '123', role: 'admin' }, tenantId: '456' })
 *    // ✅ All OrmContext fields are type-checked
 *
 * 6. Transactions maintain types:
 *    await db.tx({}, async (txDb) => {
 *      const user = await txDb().users.create({ ... });
 *      // ✅ Same types as non-transactional queries
 *    });
 *
 * No more `any` types! 🎉
 */
