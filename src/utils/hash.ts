import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string, returned as hex.
 * Used for cache keys (diff content → deterministic hash).
 */
export function hashDiff(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
