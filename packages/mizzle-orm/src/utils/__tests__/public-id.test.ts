/**
 * Public ID generation tests
 */

import { describe, it, expect } from 'vitest';
import { generatePublicId } from '../public-id';

describe('generatePublicId', () => {
  it('should generate ID with correct prefix', () => {
    const id = generatePublicId('user');
    expect(id).toMatch(/^user_/);
  });

  it('should generate ID with default length', () => {
    const id = generatePublicId('org');
    // Format: prefix_<22 chars> = 4 + 22 = 26 total
    expect(id.length).toBe(26);
  });

  it('should generate ID with custom length', () => {
    const id = generatePublicId('team', 16);
    // Format: prefix_<16 chars> = 5 + 16 = 21 total
    expect(id.length).toBe(21);
  });

  it('should generate unique IDs', () => {
    const id1 = generatePublicId('test');
    const id2 = generatePublicId('test');
    expect(id1).not.toBe(id2);
  });

  it('should only contain URL-safe characters', () => {
    const id = generatePublicId('doc');
    // nanoid uses A-Za-z0-9_-
    expect(id).toMatch(/^doc_[A-Za-z0-9_-]+$/);
  });

  it('should work with different prefixes', () => {
    const prefixes = ['user', 'org', 'team', 'doc', 'file'];
    const ids = prefixes.map((prefix) => generatePublicId(prefix));

    ids.forEach((id, index) => {
      expect(id).toMatch(new RegExp(`^${prefixes[index]}_`));
    });
  });
});
