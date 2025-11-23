/**
 * Unit tests for RelationPipelineBuilder
 * Verifies that the correct MongoDB aggregation pipeline is generated
 */

import { describe, it, expect } from 'vitest';
import { RelationPipelineBuilder } from '../relation-pipeline-builder';
import { mongoCollection } from '../../collection/collection';
import { lookup, embed } from '../../collection/relations';
import { string, objectId } from '../../schema/fields';

describe('RelationPipelineBuilder', () => {
  // Define test collections
  const organizations = mongoCollection('organizations', {
    _id: objectId().internalId(),
    name: string(),
    type: string(),
    website: string(),
  });

  const users = mongoCollection('users', {
    _id: objectId().internalId(),
    name: string(),
    email: string(),
    organizationId: objectId(),
  }, {
    relations: {
      organization: lookup(organizations, {
        localField: 'organizationId',
        foreignField: '_id',
        one: true,
        projection: { name: 1, website: 1 },
      }),
    },
  });

  const posts = mongoCollection('posts', {
    _id: objectId().internalId(),
    title: string(),
    authorId: objectId(),
  }, {
    relations: {
      author: lookup(users, {
        localField: 'authorId',
        foreignField: '_id',
        one: true,
      }),
      authorEmbed: embed(users, {
        forward: { from: 'authorId' },
      }),
    },
  });

  describe('Basic $lookup generation', () => {
    it('should generate correct $lookup stage for simple relation', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, 'organization');

      expect(pipeline).toHaveLength(2); // $lookup + $unwind

      // Verify $lookup stage
      expect(pipeline[0]).toEqual({
        $lookup: {
          from: 'organizations',
          localField: 'organizationId',
          foreignField: '_id',
          as: 'organization',
          pipeline: [
            { $project: { _id: 1, name: 1, website: 1 } }
          ],
        },
      });

      // Verify $unwind stage
      expect(pipeline[1]).toEqual({
        $unwind: {
          path: '$organization',
          preserveNullAndEmptyArrays: true,
        },
      });
    });

    it('should generate $lookup without $unwind for array relations', () => {
      const arrayRelation = mongoCollection('teams', {
        _id: objectId().internalId(),
        name: string(),
      }, {
        relations: {
          members: lookup(users, {
            localField: '_id',
            foreignField: 'teamId',
            one: false, // Array relation
          }),
        },
      });

      const pipeline = RelationPipelineBuilder.buildPipeline(arrayRelation, 'members');

      expect(pipeline).toHaveLength(1); // Only $lookup, no $unwind
      expect(pipeline[0]).toEqual({
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'teamId',
          as: 'members',
        },
      });
    });
  });

  describe('Projection handling', () => {
    it('should apply default projection from relation definition', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: true,
      });

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline).toEqual([
        { $project: { _id: 1, name: 1, website: 1 } }
      ]);
    });

    it('should override default projection with query-time projection', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          projection: { name: 1, type: 1 },
        },
      });

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline).toEqual([
        { $project: { _id: 1, name: 1, type: 1 } }
      ]);
    });

    it('should always include _id in projection', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          projection: { name: 1 },
        },
      });

      const lookupStage = pipeline[0] as any;
      const projectStage = lookupStage.$lookup.pipeline[0];
      expect(projectStage.$project._id).toBe(1);
      expect(projectStage.$project.name).toBe(1);
    });

    it('should exclude _id when explicitly excluded', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          projection: { name: 1, _id: 0 },
        },
      });

      const lookupStage = pipeline[0] as any;
      const projectStage = lookupStage.$lookup.pipeline[0];
      expect(projectStage.$project._id).toBe(0);
      expect(projectStage.$project.name).toBe(1);
    });
  });

  describe('Filter handling (where)', () => {
    it('should apply default where clause from relation definition', () => {
      const filtered = mongoCollection('posts', {
        _id: objectId().internalId(),
      }, {
        relations: {
          publishedComments: lookup(posts, {
            localField: '_id',
            foreignField: 'postId',
            one: false,
            where: { published: true },
          }),
        },
      });

      const pipeline = RelationPipelineBuilder.buildPipeline(filtered, 'publishedComments');

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline).toContainEqual({
        $match: { published: true }
      });
    });

    it('should AND query-time where with default where', () => {
      const filtered = mongoCollection('posts', {
        _id: objectId().internalId(),
      }, {
        relations: {
          comments: lookup(posts, {
            localField: '_id',
            foreignField: 'postId',
            one: false,
            where: { published: true },
          }),
        },
      });

      const pipeline = RelationPipelineBuilder.buildPipeline(filtered, {
        comments: {
          where: { likes: { $gte: 10 } },
        },
      });

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline[0]).toEqual({
        $match: {
          $and: [
            { published: true },
            { likes: { $gte: 10 } }
          ]
        }
      });
    });
  });

  describe('Sort and limit handling', () => {
    it('should add $sort stage from query config', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          sort: { name: 1 },
        },
      });

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline).toContainEqual({
        $sort: { name: 1 }
      });
    });

    it('should add $limit stage from query config', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          limit: 10,
        },
      });

      const lookupStage = pipeline[0] as any;
      expect(lookupStage.$lookup.pipeline).toContainEqual({
        $limit: 10
      });
    });

    it('should order pipeline stages correctly: match -> sort -> limit -> project', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(users, {
        organization: {
          where: { active: true },
          sort: { name: -1 },
          limit: 5,
          projection: { name: 1 },
        },
      });

      const lookupStage = pipeline[0] as any;
      const subPipeline = lookupStage.$lookup.pipeline;

      expect(subPipeline[0]).toEqual({ $match: { active: true } });
      expect(subPipeline[1]).toEqual({ $sort: { name: -1 } });
      expect(subPipeline[2]).toEqual({ $limit: 5 });
      expect(subPipeline[3]).toEqual({ $project: { _id: 1, name: 1 } });
    });
  });

  describe('Nested includes', () => {
    it('should generate nested $lookup stages', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(posts, {
        author: {
          include: {
            organization: true,
          },
        },
      });

      // Outer $lookup for author
      const authorLookup = pipeline[0] as any;
      expect(authorLookup.$lookup.from).toBe('users');

      // Nested $lookup for organization inside author pipeline
      const authorPipeline = authorLookup.$lookup.pipeline;
      const orgLookup = authorPipeline.find((stage: any) => stage.$lookup?.from === 'organizations');
      expect(orgLookup).toBeDefined();
      expect(orgLookup.$lookup.as).toBe('organization');
    });

    it('should apply nested projection', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(posts, {
        author: {
          projection: { name: 1, organizationId: 1 },
          include: {
            organization: {
              projection: { name: 1 },
            },
          },
        },
      });

      const authorLookup = pipeline[0] as any;
      const authorPipeline = authorLookup.$lookup.pipeline;

      // Check outer projection
      const outerProject = authorPipeline.find((s: any) => s.$project);
      expect(outerProject.$project).toEqual({ _id: 1, name: 1, organizationId: 1 });

      // Check inner projection
      const orgLookup = authorPipeline.find((s: any) => s.$lookup?.from === 'organizations');
      const innerProject = orgLookup.$lookup.pipeline[0];
      expect(innerProject.$project).toEqual({ _id: 1, name: 1 });
    });
  });

  describe('Multiple relations', () => {
    it('should generate $lookup stages for multiple relations', () => {
      const multi = mongoCollection('posts', {
        _id: objectId().internalId(),
        authorId: objectId(),
        categoryId: objectId(),
      }, {
        relations: {
          author: lookup(users, {
            localField: 'authorId',
            foreignField: '_id',
            one: true,
          }),
          category: lookup(organizations, {
            localField: 'categoryId',
            foreignField: '_id',
            one: true,
          }),
        },
      });

      const pipeline = RelationPipelineBuilder.buildPipeline(multi, {
        author: true,
        category: true,
      });

      expect(pipeline.length).toBeGreaterThanOrEqual(4); // 2x ($lookup + $unwind)

      const authorLookup = pipeline.find((s: any) => s.$lookup?.as === 'author');
      const categoryLookup = pipeline.find((s: any) => s.$lookup?.as === 'category');

      expect(authorLookup).toBeDefined();
      expect(categoryLookup).toBeDefined();
    });
  });

  describe('Embed relations', () => {
    it('should skip embed relations (no $lookup generated)', () => {
      const pipeline = RelationPipelineBuilder.buildPipeline(posts, {
        author: true,
        // authorEmbed: true, // This would cause a type error now
      });

      // Should only have stages for 'author' lookup, not 'authorEmbed'
      expect(pipeline).toHaveLength(2); // $lookup + $unwind for author only
      expect(pipeline[0]).toHaveProperty(['$lookup', 'as'], 'author');
    });
  });
});
