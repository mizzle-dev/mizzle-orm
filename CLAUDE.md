# Mizzle ORM - AI Assistant Guide

## Repository Overview

**Mizzle ORM** is a MongoDB ORM with exceptional DX, inspired by Drizzle ORM, Convex, and oRPC. It provides a type-safe, schema-first approach to MongoDB with features like row-level security, lifecycle hooks, dual ID support (ObjectId + public IDs), soft deletes, and powerful relations.

**Key Features:**
- 🔷 Full TypeScript support with end-to-end type safety
- 🎯 Drizzle-style DX with clean, intuitive API
- 🔐 Built-in row-level security policies
- 🪝 Lifecycle hooks (before/after operations)
- 🆔 Dual ID support (internal ObjectId + public prefixed IDs like `user_abc123`)
- 🗑️ Soft delete and restore functionality
- ⚡ Zero-config with sensible defaults
- 🔍 Type-safe queries with full IntelliSense

**Project Maturity:** Early development (v0.0.1) - API may change

---

## Codebase Structure

```
mizzle-orm/
├── packages/
│   └── mizzle-orm/              # Core ORM package
│       ├── src/
│       │   ├── collection/      # Collection definitions & relations
│       │   │   ├── collection.ts          # mongoCollection() definition
│       │   │   └── relations.ts           # lookup(), embed(), reference()
│       │   ├── orm/             # ORM initialization & context
│       │   │   └── orm.ts                 # createMongoOrm()
│       │   ├── query/           # Query execution & relation pipelines
│       │   │   ├── collection-facade.ts   # CRUD operations (findById, create, etc.)
│       │   │   └── relation-pipeline-builder.ts
│       │   ├── schema/          # Field builders & schema definition
│       │   │   ├── fields.ts              # string(), number(), date(), etc.
│       │   │   ├── field-builder-base.ts
│       │   │   ├── field-builders-primitive.ts
│       │   │   ├── field-builders-complex.ts
│       │   │   └── field-builders-mongo.ts
│       │   ├── types/           # TypeScript type definitions
│       │   │   ├── collection.ts
│       │   │   ├── field.ts
│       │   │   ├── inference.ts           # InferDocument, InferInsert, etc.
│       │   │   ├── include.ts             # Relation inclusion types
│       │   │   └── orm.ts
│       │   ├── utils/           # Utility functions
│       │   │   └── public-id.ts           # Public ID generation (nanoid)
│       │   ├── validation/      # Zod schema generation
│       │   │   └── zod-schema-generator.ts
│       │   ├── test/            # Test setup & utilities
│       │   │   └── setup.ts
│       │   └── index.ts         # Public API exports
│       ├── docs/                # Documentation
│       │   ├── README.md
│       │   ├── embeds-guide.md
│       │   ├── embeds.md
│       │   └── lookup-to-embed-migration.md
│       ├── examples/            # Usage examples
│       │   ├── basic-schema.ts
│       │   ├── blog-with-embeds.ts
│       │   ├── crud-operations.ts
│       │   ├── ecommerce-orders.ts
│       │   └── relations.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts       # Build configuration
│       └── vitest.config.ts     # Test configuration
├── .changeset/                  # Changesets for versioning
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI pipeline (test, lint, typecheck)
│       └── release.yml         # Automated releases with changesets
├── .prettierrc                 # Code formatting rules
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace config
├── CONTRIBUTING.md             # Contribution guidelines
└── README.md                   # Main documentation
```

**Source Code Statistics:** ~5,341 lines of TypeScript code

---

## Key Technologies & Dependencies

### Core Stack
- **Runtime:** Node.js >=18
- **Language:** TypeScript 5.3+ (strict mode enabled)
- **Package Manager:** pnpm >=9 (specifically 10.1.0)
- **Module System:** ESM (with CJS compatibility)
- **Target:** ES2022

### Dependencies
- **mongodb** ^7.0.0 - MongoDB driver (peer dependency >=5.0.0)
- **zod** ^4.1.12 - Runtime validation & schema generation
- **nanoid** ^5.0.0 - Public ID generation

### Dev Dependencies
- **tsup** - Fast TypeScript bundler (ESM + CJS)
- **vitest** - Fast unit test framework with v8 coverage
- **mongodb-memory-server** - In-memory MongoDB for testing
- **eslint** + **@typescript-eslint** - Linting
- **prettier** - Code formatting
- **turbo** - Monorepo build orchestration
- **@changesets/cli** - Version management

---

## Development Workflows

### Setup
```bash
# Clone and install
git clone <repo-url>
cd mizzle-orm
pnpm install
```

### Common Commands
```bash
# Development
pnpm dev              # Watch mode for building
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:ui          # Run tests with Vitest UI
pnpm typecheck        # Type check without emit
pnpm lint             # Lint codebase
pnpm format           # Format with Prettier

# Clean slate
pnpm clean            # Remove dist, node_modules, .turbo

# Versioning
pnpm changeset        # Create a changeset
pnpm version-packages # Bump versions (automated in CI)
pnpm release          # Build and publish (automated in CI)
```

### Turborepo Tasks
All tasks run through Turborepo for caching and parallelization:
- `build` - Depends on `^build` (builds dependencies first)
- `test` - Depends on `build`, outputs to `coverage/**`
- `lint` - Depends on `^build`
- `typecheck` - Depends on `^build`
- `dev` - No cache, persistent mode

---

## Architecture & Core Concepts

### 1. Schema-First Design
Collections are defined using a schema-first approach similar to Drizzle ORM:

```typescript
const users = mongoCollection('users', {
  _id: objectId().internalId(),      // Internal MongoDB ObjectId
  id: publicId('user'),               // Public ID like 'user_abc123'
  email: string().email().unique(),
  displayName: string(),
  role: string().enum(['user', 'admin']).default('user'),
  createdAt: date().defaultNow(),
  updatedAt: date().defaultNow().onUpdateNow(),
  deletedAt: date().nullable().softDeleteFlag(),
});
```

### 2. Type Inference System
The ORM provides powerful type inference from schema definitions:

- **InferDocument<T>** - Full document type (all fields)
- **InferInsert<T>** - Insert type (required fields only, no auto-generated)
- **InferUpdate<T>** - Update type (all fields optional)
- **InferFieldType<T>** - Extract type from field builder

Types are inferred through the field builders' `_type` phantom property.

### 3. Context-Based Operations
All database operations require a context (for policies, hooks, etc.):

```typescript
const ctx = orm.createContext({ user, tenantId });
const db = orm.withContext(ctx);
await db.users.findById(id); // Context applied automatically
```

### 4. Relations System
Three types of relations:

**Reference Relations** (Foreign keys):
```typescript
reference(targetCollection, {
  localField: 'authorId',
  foreignField: '_id',
  onDelete: 'cascade',
})
```

**Embed Relations** (Denormalized data):
```typescript
embed(sourceCollection, {
  forward: {
    from: 'authorId',
    fields: ['id', 'name', 'avatar'],
  },
  keepFresh: true, // Auto-update embedded data
})
```

**Lookup Relations** (Virtual aggregations):
```typescript
lookup(targetCollection, {
  localField: '_id',
  foreignField: 'authorId',
  one: false, // Returns array
})
```

### 5. Row-Level Security (RLS)
Policies are automatically applied to queries:

```typescript
mongoCollection('posts', schema, {
  policies: {
    readFilter: (ctx) => ({ orgId: ctx.tenantId }),
    writeFilter: (ctx) => ({ orgId: ctx.tenantId }),
    canUpdate: (ctx, oldDoc, newDoc) => {
      return ctx.user?.roles?.includes('admin') || oldDoc.authorId === ctx.user?.id;
    },
  },
});
```

### 6. Lifecycle Hooks
Execute logic before/after operations:

```typescript
mongoCollection('users', schema, {
  hooks: {
    beforeInsert: async (ctx, doc) => {
      console.log('Creating user:', doc.email);
      return doc;
    },
    afterInsert: async (ctx, doc) => {
      await sendWelcomeEmail(doc.email);
    },
  },
});
```

### 7. Dual ID System
- **_id**: Internal MongoDB ObjectId (never exposed externally)
- **id**: Public prefixed ID using nanoid (e.g., `user_V1StGXR8_Z5jdHi6B-myT`)

All query methods accept either ID type.

---

## Code Conventions

### TypeScript Strict Mode
The project uses strict TypeScript with additional strictness:
```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedIndexedAccess": true
}
```

### Code Style (Prettier)
- **Semi-colons:** Yes
- **Quotes:** Single quotes
- **Trailing commas:** Always
- **Print width:** 100 characters
- **Tab width:** 2 spaces
- **Arrow parens:** Always

### Naming Conventions
- **Collections:** camelCase (e.g., `users`, `blogPosts`)
- **Fields:** camelCase (e.g., `displayName`, `createdAt`)
- **Types:** PascalCase with prefix (e.g., `InferDocument`, `CollectionDefinition`)
- **Private/internal:** Prefix with `_` (e.g., `_schema`, `_meta`)
- **Phantom types:** Prefix with `$` (e.g., `$inferDocument`)
- **Config objects:** Suffix with `Config` (e.g., `PolicyConfig`, `EmbedConfig`)
- **Function factories:** Lowercase function names (e.g., `mongoCollection`, `createMongoOrm`)

### File Organization
- **One main export per file** (e.g., `collection.ts` exports `mongoCollection`)
- **Co-locate tests:** `__tests__` directories next to source files
- **Type definitions:** Separate `types/` directory for complex types
- **Barrel exports:** Main `index.ts` for public API

### Import/Export Patterns
- Use **named exports** (no default exports)
- Organize imports: external deps → internal modules → types
- Export types with `export type` for type-only imports

---

## Testing Strategy

### Framework: Vitest
- **Location:** Tests in `src/**/__tests__/*.test.ts`
- **Coverage:** v8 provider, outputs to `coverage/`
- **Environment:** Node.js
- **Globals:** Enabled (no need to import `describe`, `it`, etc.)

### Test Utilities
- `mongodb-memory-server` - Spin up in-memory MongoDB for integration tests
- `src/test/setup.ts` - Shared test setup and utilities

### Writing Tests
```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = createInput();

    // Act
    const result = doSomething(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Test Coverage
- Aim for high coverage, especially for core functionality
- CI runs `pnpm test` on Node 18.x and 20.x

---

## Git Workflow

### Branch Strategy
- **main** - Stable branch, protected
- **feature/** - Feature branches
- **fix/** - Bug fix branches
- **chore/** - Maintenance/refactoring branches
- **claude/** - AI assistant working branches (special prefix for CI)

### Commit Convention
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug
docs: update documentation
chore: update dependencies
test: add tests
refactor: refactor code
perf: performance improvement
style: code style changes
ci: CI/CD changes
```

**Examples:**
- `feat(schema): add object field builder`
- `fix(orm): handle null context properly`
- `docs(embeds): update embed guide`
- `test(inference): add nested include tests`

### Pull Request Process
1. Create feature branch from `main`
2. Make changes and add tests
3. Create changeset: `pnpm changeset`
4. Commit with conventional commit message
5. Push and create PR against `main`
6. Ensure CI passes (typecheck, lint, build, test)
7. Get review approval
8. Squash and merge

### Recent Commits
The repository has recent work on:
- Type inference for nested includes (#8)
- Relations embed API implementation (#7)
- Object field builder (#6)
- Perfect type safety implementation (#3)

---

## Release Process

### Changesets Workflow
This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

**Creating a Changeset:**
```bash
pnpm changeset
# Select packages that changed
# Choose version bump: major (breaking), minor (feature), patch (fix)
# Write summary of changes
```

**Automated Release:**
1. PR merged to `main` with changesets
2. Release PR automatically created by Changesets bot
3. Release PR updates versions and CHANGELOGs
4. Merging release PR triggers `pnpm release` → publishes to npm
5. GitHub Actions uses `NPM_TOKEN` secret for publishing

**Manual Testing Before Release:**
```bash
pnpm build    # Ensure clean build
pnpm test     # All tests pass
pnpm typecheck # No type errors
```

---

## Important Files for AI Assistants

### Core Implementation Files
1. **src/index.ts** - Public API surface, all exports
2. **src/collection/collection.ts** - `mongoCollection()` definition
3. **src/collection/relations.ts** - `lookup()`, `embed()`, `reference()`
4. **src/orm/orm.ts** - `createMongoOrm()` implementation
5. **src/query/collection-facade.ts** - CRUD methods (findById, create, update, etc.)
6. **src/schema/fields.ts** - Field factory functions

### Type System Files
1. **src/types/inference.ts** - Type inference utilities
2. **src/types/collection.ts** - Collection, relation, and policy types
3. **src/types/field.ts** - Field builder types
4. **src/types/include.ts** - Relation inclusion types

### Configuration Files
1. **package.json** - Project dependencies and scripts
2. **tsconfig.json** - TypeScript configuration
3. **tsup.config.ts** - Build configuration
4. **vitest.config.ts** - Test configuration
5. **turbo.json** - Monorepo task orchestration
6. **.prettierrc** - Code formatting rules

### Documentation Files
1. **README.md** - Main documentation
2. **CONTRIBUTING.md** - Contribution guidelines
3. **docs/embeds-guide.md** - Embed relations guide
4. **examples/** - Usage examples

---

## Common Tasks & Patterns

### Adding a New Field Type
1. Create field builder in `src/schema/field-builders-*.ts`
2. Add type definition to `src/types/field.ts`
3. Export from `src/schema/fields.ts`
4. Add to public exports in `src/index.ts`
5. Write tests in `src/schema/__tests__/fields.test.ts`

### Adding a New Collection Method
1. Add method to `CollectionFacade` in `src/query/collection-facade.ts`
2. Update types if needed
3. Add tests in `src/query/__tests__/`
4. Update documentation

### Modifying Type Inference
1. Update inference logic in `src/types/inference.ts`
2. Test with various schema combinations
3. Add type tests to verify IntelliSense works
4. Check that existing tests still pass

### Adding a New Relation Type
1. Define relation type in `src/types/collection.ts`
2. Add factory function in `src/collection/relations.ts`
3. Implement pipeline builder logic in `src/query/relation-pipeline-builder.ts`
4. Add tests in `src/query/__tests__/`
5. Update documentation in `docs/`

---

## Things to Avoid

### ❌ Don't
1. **Modify the public API without discussion** - This is a library, breaking changes affect users
2. **Skip changesets** - Always create a changeset for changes
3. **Commit without tests** - All new features/fixes need tests
4. **Ignore TypeScript errors** - Strict mode is enabled for a reason
5. **Use `any` unnecessarily** - Use proper types or `unknown`
6. **Modify `_meta` or `_schema` outside collection definition** - These are immutable
7. **Break type inference** - The type system is the core value proposition
8. **Add dependencies without justification** - Keep the bundle small
9. **Commit directly to `main`** - Always use PRs
10. **Skip the linter/formatter** - Run `pnpm format` and `pnpm lint` before committing

### ✅ Do
1. **Read existing code first** - Understand patterns before adding new code
2. **Write tests first (TDD)** - Especially for complex logic
3. **Keep types strict** - Use generics to preserve type information
4. **Document complex logic** - JSDoc comments for exported APIs
5. **Follow existing patterns** - Be consistent with the codebase
6. **Ask questions** - Open an issue if unsure about approach
7. **Update documentation** - Keep docs in sync with code
8. **Test with real MongoDB** - Not just mocks (use mongodb-memory-server)
9. **Consider backwards compatibility** - This is a public library
10. **Think about DX** - Developer experience is a top priority

---

## Type Safety Best Practices

### Phantom Types
The codebase uses phantom types extensively for type tracking without runtime overhead:

```typescript
interface CollectionDefinition<TSchema, TRelations> {
  _schema: TSchema;
  _relationTargets: TRelations; // Phantom - never exists at runtime
  $inferDocument: InferDocument<...>; // Phantom - for type inference
}
```

### Generic Preservation
Maintain literal types through generics:

```typescript
// ✅ Good - preserves literal type
function mongoCollection<TSchema extends SchemaDefinition>(
  name: string,
  schema: TSchema,
): CollectionDefinition<TSchema> { ... }

// ❌ Bad - loses literal type
function mongoCollection(
  name: string,
  schema: SchemaDefinition,
): CollectionDefinition<SchemaDefinition> { ... }
```

### Type Inference Helpers
Use type helpers for cleaner APIs:

```typescript
type InferDocument<T> = T extends CollectionDefinition<infer S, any>
  ? { [K in keyof S]: InferFieldType<S[K]> }
  : never;
```

---

## Performance Considerations

### Build Performance
- `tsup` is used for fast builds (ESM + CJS in parallel)
- Turborepo caches build outputs
- `isolatedModules` enabled for faster type checking

### Runtime Performance
- No runtime schema validation by default (optional Zod schemas)
- Indexes defined at schema level for MongoDB
- Efficient query builders with minimal overhead
- Tree-shakeable exports for optimal bundle size

### Database Performance
- Use indexes wisely (field-level and compound)
- Embed relations for read-heavy workloads
- Lookup relations for write-heavy workloads
- Consider denormalization trade-offs

---

## Debugging Tips

### Type Errors
1. Use `Cmd+Click` (or `Ctrl+Click`) to jump to type definitions
2. Check `src/types/inference.ts` for type inference logic
3. Use TypeScript's "Go to Type Definition" for phantom types
4. Test with `pnpm typecheck` for full type checking

### Test Failures
1. Run individual test: `pnpm test <filename>`
2. Use Vitest UI: `pnpm test:ui`
3. Check mongodb-memory-server logs
4. Verify test data setup in `src/test/setup.ts`

### Build Issues
1. Clean build: `pnpm clean && pnpm install && pnpm build`
2. Check `tsup.config.ts` for build configuration
3. Verify `tsconfig.json` settings
4. Check for circular dependencies

---

## Resources

### External Documentation
- **MongoDB Node.js Driver:** https://www.mongodb.com/docs/drivers/node/
- **Drizzle ORM:** https://orm.drizzle.team/ (inspiration)
- **Convex:** https://www.convex.dev/ (inspiration)
- **Zod:** https://zod.dev/ (validation)
- **Changesets:** https://github.com/changesets/changesets

### Internal Documentation
- **Embed Guide:** `/packages/mizzle-orm/docs/embeds-guide.md`
- **Migration Guide:** `/packages/mizzle-orm/docs/lookup-to-embed-migration.md`
- **Examples:** `/packages/mizzle-orm/examples/`

---

## Working with AI Assistants

### When Making Changes
1. **Read before writing** - Always read the relevant files first
2. **Understand context** - Check related tests and types
3. **Maintain consistency** - Follow existing patterns
4. **Preserve types** - Don't break type inference
5. **Add tests** - Include tests for all changes
6. **Update docs** - Keep documentation in sync
7. **Create changeset** - Run `pnpm changeset` for versioned changes

### Communication Style
- **Be specific** - Reference file paths and line numbers
- **Explain reasoning** - Why, not just what
- **Consider trade-offs** - Discuss pros/cons of approaches
- **Ask for clarification** - Don't assume requirements

### Quality Checklist
Before submitting changes, verify:
- [ ] Code follows style guide (run `pnpm format`)
- [ ] No linting errors (run `pnpm lint`)
- [ ] Types are correct (run `pnpm typecheck`)
- [ ] Tests pass (run `pnpm test`)
- [ ] Tests added for new features/fixes
- [ ] Documentation updated if needed
- [ ] Changeset created (run `pnpm changeset`)
- [ ] Conventional commit message used

---

**Last Updated:** 2025-11-23
**Repository Version:** v0.0.1
**AI Assistant:** Claude Code by Anthropic
