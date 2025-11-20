/**
 * Public ID generation utilities
 */

import { nanoid } from 'nanoid';

/**
 * Default ID length (generates ~132 bits of entropy)
 */
const DEFAULT_ID_LENGTH = 22;

/**
 * Generate a public ID with prefix
 * @param prefix - The prefix (e.g., 'user' for 'user_abc123')
 * @param length - Length of the random portion (default: 22)
 * @returns Generated public ID (e.g., 'user_V1StGXR8_Z5jdHi6B-myT')
 *
 * @example
 * generatePublicId('user') // 'user_V1StGXR8_Z5jdHi6B-myT'
 * generatePublicId('proj', 16) // 'proj_KYr8p-LKHuIXmOpY'
 */
export function generatePublicId(prefix: string, length: number = DEFAULT_ID_LENGTH): string {
  const id = nanoid(length);
  return `${prefix}_${id}`;
}

/**
 * Parse a public ID into prefix and ID parts
 * @param publicId - The public ID to parse
 * @returns Object with prefix and id, or null if invalid
 *
 * @example
 * parsePublicId('user_abc123') // { prefix: 'user', id: 'abc123' }
 * parsePublicId('invalid') // null
 */
export function parsePublicId(publicId: string): { prefix: string; id: string } | null {
  const parts = publicId.split('_');
  if (parts.length !== 2) {
    return null;
  }
  return {
    prefix: parts[0]!,
    id: parts[1]!,
  };
}

/**
 * Validate a public ID format
 * @param publicId - The public ID to validate
 * @param expectedPrefix - Optional expected prefix
 * @returns True if valid
 *
 * @example
 * validatePublicId('user_abc123') // true
 * validatePublicId('user_abc123', 'user') // true
 * validatePublicId('user_abc123', 'proj') // false
 * validatePublicId('invalid') // false
 */
export function validatePublicId(publicId: string, expectedPrefix?: string): boolean {
  const parsed = parsePublicId(publicId);
  if (!parsed) {
    return false;
  }
  if (expectedPrefix && parsed.prefix !== expectedPrefix) {
    return false;
  }
  return true;
}
