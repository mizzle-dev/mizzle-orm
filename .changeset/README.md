# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to manage package versioning and changelog generation.

## How to use

When you make changes to a package, run:

```bash
pnpm changeset
```

This will prompt you to:

1. Select which packages have changed
2. Specify the version bump type (major, minor, patch)
3. Write a summary of the changes

The changeset will be stored in this directory and used when releasing packages.
