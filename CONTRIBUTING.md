# Contributing to Mizzle ORM

Thank you for your interest in contributing to Mizzle ORM!

## Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the project:
   ```bash
   pnpm build
   ```
4. Run tests:
   ```bash
   pnpm test
   ```

## Project Structure

This is a monorepo managed with pnpm workspaces and Turborepo:

```
mizzle-orm/
├── packages/
│   └── mizzle-orm/          # Core ORM package
├── .changeset/              # Changesets for versioning
├── .github/                 # GitHub Actions workflows
└── turbo.json              # Turborepo configuration
```

## Making Changes

1. Create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the appropriate package

3. Add tests for your changes

4. Run the test suite:

   ```bash
   pnpm test
   ```

5. Create a changeset:

   ```bash
   pnpm changeset
   ```

6. Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/):

   ```
   feat: add new feature
   fix: fix bug
   docs: update documentation
   chore: update dependencies
   ```

7. Push and create a pull request

## Code Style

- We use Prettier for code formatting
- We use ESLint for linting
- Run `pnpm format` before committing

## Testing

- Write tests for all new features
- Ensure all tests pass before submitting a PR
- Aim for high test coverage

## Pull Request Process

1. Ensure your PR has a clear description of the changes
2. Link any related issues
3. Ensure all CI checks pass
4. Request review from maintainers
5. Address any feedback

## Release Process

Releases are automated using Changesets:

1. Changesets are created during development
2. On merge to main, a release PR is automatically created
3. Merging the release PR publishes to npm

## Questions?

Feel free to open an issue for any questions or concerns!
