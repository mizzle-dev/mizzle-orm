/**
 * Standard Schema validation error
 * Thrown when data fails validation against a Standard Schema-based collection
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Validation issue from Standard Schema
 * Re-exported for convenience
 */
export type ValidationIssue = StandardSchemaV1.Issue;

/**
 * Error thrown when Standard Schema validation fails
 * 
 * Contains the full issues array from the validation result for detailed error handling.
 * 
 * @example
 * ```typescript
 * try {
 *   await users.create({ email: 'invalid', name: '' });
 * } catch (error) {
 *   if (error instanceof SSValidationError) {
 *     console.log(error.issues);
 *     // [
 *     //   { message: 'Invalid email', path: ['email'] },
 *     //   { message: 'String must be at least 1 character', path: ['name'] }
 *     // ]
 *   }
 * }
 * ```
 */
export class SSValidationError extends Error {
  /**
   * The validation issues from Standard Schema
   * Each issue contains a message and optional path to the invalid field
   */
  public readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[], message?: string) {
    // Build a descriptive message from issues if not provided
    const firstIssue = issues[0];
    const defaultMessage = issues.length === 1 && firstIssue
      ? `Validation failed: ${firstIssue.message}`
      : `Validation failed with ${issues.length} issues: ${issues.map(i => i.message).join('; ')}`;

    super(message || defaultMessage);
    this.name = 'SSValidationError';
    this.issues = issues;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SSValidationError);
    }
  }

  /**
   * Get issues at a specific path
   * @param path - The path to filter by (e.g., ['user', 'email'])
   */
  getIssuesAtPath(path: (string | number | symbol)[]): readonly ValidationIssue[] {
    return this.issues.filter(issue => {
      if (!issue.path || issue.path.length !== path.length) return false;
      return issue.path.every((segment, index) => segment === path[index]);
    });
  }

  /**
   * Get all unique paths that have issues
   */
  get paths(): string[] {
    const pathStrings = new Set<string>();
    for (const issue of this.issues) {
      if (issue.path && issue.path.length > 0) {
        pathStrings.add(issue.path.join('.'));
      }
    }
    return Array.from(pathStrings);
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      issues: this.issues.map(issue => ({
        message: issue.message,
        path: issue.path,
      })),
    };
  }
}
