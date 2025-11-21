/**
 * Reverse EMBED relations tests - Advanced scenarios (Array & In-Place)
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { teardownTestDb, clearTestDb, createTestOrm } from '../../test/setup';
import { mongoCollection } from '../../collection/collection';
import { string, array, object, objectId } from '../../schema/fields';
import { embed } from '../../collection/relations';

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('Reverse Embeds - Array Strategy', () => {
  it('should auto-update array embeds when source changes', async () => {
    // Tags collection
    const tags = mongoCollection('tags', {
      _id: objectId().internalId(),
      name: string(),
      color: string(),
    });

    // Posts with array of tag embeds
    const posts = mongoCollection(
      'posts',
      {
        _id: objectId().internalId(),
        title: string(),
        tagIds: array(objectId()),
      },
      {
        relations: {
          tags: embed(tags, {
            forward: {
              from: 'tagIds',
              fields: ['name', 'color'],
            },
            keepFresh: true, // Auto-update when tag changes
          }),
        },
      },
    );

    const orm = await createTestOrm({ tags, posts });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    // Create tags
    const tag1 = await db.tags.create({
      name: 'Tech',
      color: 'blue',
    });

    const tag2 = await db.tags.create({
      name: 'News',
      color: 'red',
    });

    // Create post with multiple tags
    const post = await db.posts.create({
      title: 'My Post',
      tagIds: [tag1._id, tag2._id],
    });

    // Verify initial embeds
    expect(post.tags).toBeDefined();
    if (!Array.isArray(post.tags)) throw new Error('Expected array embed');
    expect(post.tags).toHaveLength(2);
    expect(post.tags[0].name).toBe('Tech');
    expect(post.tags[1].name).toBe('News');

    // Update one of the tags
    await db.tags.updateById(tag1._id, {
      name: 'Technology',
      color: 'dark-blue',
    });

    // Fetch post again - embedded data for tag1 should be updated
    const refreshedPost = await db.posts.findById(post._id);

    expect(refreshedPost).toBeDefined();
    if (!Array.isArray(refreshedPost?.tags)) throw new Error('Expected array embed');
    expect(refreshedPost.tags).toHaveLength(2);

    // Find the updated tag in the array
    const updatedTag = refreshedPost.tags.find((t) => t._id === tag1._id.toHexString());
    expect(updatedTag).toBeDefined();
    expect(updatedTag?.name).toBe('Technology');
    expect(updatedTag?.color).toBe('dark-blue');

    // Other tag should remain unchanged
    const unchangedTag = refreshedPost.tags.find((t) => t._id === tag2._id.toHexString());
    expect(unchangedTag?.name).toBe('News');
    expect(unchangedTag?.color).toBe('red');

    await orm.close();
  });
});

describe('Reverse Embeds - In-Place Strategy', () => {
  it('should auto-update in-place embeds when source changes', async () => {
    // Directories collection
    const directories = mongoCollection('directories', {
      _id: objectId().internalId(),
      name: string(),
      type: string(),
    });

    // Workflows with in-place directory embed
    const workflows = mongoCollection(
      'workflows',
      {
        _id: objectId().internalId(),
        name: string(),
        directory: object({
          _id: objectId(),
          name: string().optional(),
          type: string().optional(),
        }),
      },
      {
        relations: {
          directoryEmbed: embed(directories, {
            forward: {
              from: 'directory._id',
              fields: ['name', 'type'],
            },
            keepFresh: true, // Auto-update when directory changes
          }),
        },
      },
    );

    const orm = await createTestOrm({ directories, workflows });
    const ctx = orm.createContext({});
    const db = orm.withContext(ctx);

    // Create directory
    const directory = await db.directories.create({
      name: 'Legal',
      type: 'department',
    });

    // Create workflow with embedded directory
    const workflow = await db.workflows.create({
      name: 'Approval Process',
      directory: {
        _id: directory._id,
      },
    });

    // Verify initial embed (in-place merge)
    expect(workflow.directory.name).toBe('Legal');
    expect(workflow.directory.type).toBe('department');

    // Update directory
    await db.directories.updateById(directory._id, {
      name: 'Legal Department',
      type: 'division',
    });

    // Fetch workflow again - embedded data should be updated
    const refreshedWorkflow = await db.workflows.findById(workflow._id);

    expect(refreshedWorkflow).toBeDefined();
    expect(refreshedWorkflow?.directory.name).toBe('Legal Department');
    expect(refreshedWorkflow?.directory.type).toBe('division');
    expect(refreshedWorkflow?.directory._id).toEqual(directory._id);

    await orm.close();
  });
});
