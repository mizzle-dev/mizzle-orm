/**
 * PathNavigator - Handles complex path navigation for EMBED relations
 *
 * Supports:
 * - Simple fields: 'authorId'
 * - Nested fields: 'author._id'
 * - Arrays: 'tags[]'
 * - Nested arrays: 'workflow.items[].refId'
 * - Complex paths: 'workflow.required[].ref._id'
 */

import { ObjectId, type Document } from 'mongodb';
import type { ForwardEmbedConfig } from '../types/collection';

export class PathNavigator {
  /**
   * Extract all IDs from document following paths
   */
  static extractIds(doc: Document, config: ForwardEmbedConfig): string[] {
    if (config.from) {
      return this.extractFromPath(doc, config.from);
    }
    if (config.paths) {
      const allIds: string[] = [];
      for (const path of config.paths) {
        allIds.push(...this.extractFromPath(doc, path));
      }
      return [...new Set(allIds)]; // Deduplicate
    }
    return [];
  }

  /**
   * Apply embeds back to document
   */
  static applyEmbeds(
    doc: Document,
    config: ForwardEmbedConfig,
    embedMap: Map<string, Document>,
    relationName: string,
  ): Document {
    const strategy = this.inferStrategy(config);

    if (strategy === 'separate') {
      return this.applySeparate(doc, config, embedMap, relationName);
    } else {
      return this.applyInPlace(doc, config, embedMap);
    }
  }

  /**
   * Infer strategy from path
   */
  static inferStrategy(config: ForwardEmbedConfig): 'separate' | 'inplace' {
    const path = config.from || config.paths?.[0];
    if (!path) return 'separate';

    // If path ends with ._id or contains ._id, it's inplace
    return path.includes('._id') ? 'inplace' : 'separate';
  }

  /**
   * Extract values at path (handles arrays with [])
   */
  private static extractFromPath(doc: Document, path: string): string[] {
    const segments = path.split('.');
    let values: any[] = [doc];

    for (const segment of segments) {
      const nextValues: any[] = [];

      for (const value of values) {
        if (value == null) continue;

        if (segment.endsWith('[]')) {
          // Array traversal
          const field = segment.slice(0, -2);
          const arr = value[field];
          if (Array.isArray(arr)) {
            nextValues.push(...arr);
          }
        } else {
          // Object navigation
          if (segment in value) {
            nextValues.push(value[segment]);
          }
        }
      }

      values = nextValues;
    }

    // Convert to string IDs
    // Handle case where final value is an array (e.g., tagIds: [id1, id2])
    const result: string[] = [];
    for (const value of values) {
      if (value == null) continue;

      if (Array.isArray(value)) {
        // If the value itself is an array, extract IDs from each element
        result.push(...value.map(v => this.toStringId(v)));
      } else {
        result.push(this.toStringId(value));
      }
    }

    return result;
  }

  /**
   * Apply embeds using separate strategy
   * Creates a new field with embedded data
   */
  private static applySeparate(
    doc: Document,
    config: ForwardEmbedConfig,
    embedMap: Map<string, Document>,
    relationName: string,
  ): Document {
    const result = { ...doc };
    const embedField = config.into || relationName;

    if (config.from) {
      const ids = this.extractFromPath(doc, config.from);

      if (ids.length === 0) {
        return result;
      }

      // Check if source field is an array
      const sourceValue = this.getValueAtPath(doc, config.from);
      const isArray = Array.isArray(sourceValue);

      if (isArray) {
        // Multiple embeds
        const embeds = ids
          .map(id => embedMap.get(id))
          .filter((embed): embed is Document => embed != null);
        result[embedField] = embeds;
      } else {
        // Single embed
        const firstId = ids[0];
        if (firstId) {
          const embed = embedMap.get(firstId);
          if (embed) {
            result[embedField] = embed;
          }
        }
      }
    } else if (config.paths) {
      // For multiple paths, always return array
      const allIds = this.extractIds(doc, config);
      const embeds = allIds
        .map(id => embedMap.get(id))
        .filter((embed): embed is Document => embed != null);
      result[embedField] = embeds;
    }

    return result;
  }

  /**
   * Apply embeds using inplace strategy
   * Merges embedded data into existing object(s)
   */
  private static applyInPlace(
    doc: Document,
    config: ForwardEmbedConfig,
    embedMap: Map<string, Document>,
  ): Document {
    const result = { ...doc };

    if (config.from) {
      this.applyInPlaceForPath(result, config.from, embedMap);
    } else if (config.paths) {
      for (const path of config.paths) {
        this.applyInPlaceForPath(result, path, embedMap);
      }
    }

    return result;
  }

  /**
   * Apply inplace embeds for a single path
   */
  private static applyInPlaceForPath(
    doc: Document,
    path: string,
    embedMap: Map<string, Document>,
  ): void {
    // Remove ._id from path to get parent object path
    if (!path.endsWith('._id')) return;

    const parentPath = path.slice(0, -4); // Remove '._id'
    const segments = parentPath.split('.');

    // Navigate to parent objects and merge embeds
    this.navigateAndMerge(doc, segments, embedMap);
  }

  /**
   * Navigate to objects and merge embed data
   */
  private static navigateAndMerge(
    current: any,
    segments: string[],
    embedMap: Map<string, Document>,
    segmentIndex: number = 0,
  ): void {
    if (segmentIndex >= segments.length) {
      // Reached target - merge embed if ID exists
      if (current && typeof current === 'object' && '_id' in current) {
        const id = this.toStringId(current._id);
        const embed = embedMap.get(id);
        if (embed) {
          // Merge embed into current object (skip _id to avoid overwriting)
          for (const [key, value] of Object.entries(embed)) {
            if (key !== '_id') {
              current[key] = value;
            }
          }
        }
      }
      return;
    }

    const segment = segments[segmentIndex];
    if (!segment) return;

    if (segment.endsWith('[]')) {
      // Array traversal
      const field = segment.slice(0, -2);
      if (current && Array.isArray(current[field])) {
        for (const item of current[field]) {
          this.navigateAndMerge(item, segments, embedMap, segmentIndex + 1);
        }
      }
    } else {
      // Object navigation
      if (current && segment in current) {
        this.navigateAndMerge(current[segment], segments, embedMap, segmentIndex + 1);
      }
    }
  }

  /**
   * Get value at a path
   */
  private static getValueAtPath(doc: Document, path: string): any {
    const segments = path.split('.');
    let current: any = doc;

    for (const segment of segments) {
      if (current == null) return undefined;

      if (segment.endsWith('[]')) {
        const field = segment.slice(0, -2);
        current = current[field];
        // Don't traverse into array, just return it
        return current;
      } else {
        current = current[segment];
      }
    }

    return current;
  }

  /**
   * Convert value to string ID
   */
  private static toStringId(value: any): string {
    if (typeof value === 'string') return value;
    if (value instanceof ObjectId) return value.toHexString();
    if (value?._id) {
      return typeof value._id === 'string'
        ? value._id
        : value._id.toHexString();
    }
    return String(value);
  }
}
