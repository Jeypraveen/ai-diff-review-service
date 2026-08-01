/**
 * In-memory cache store.
 * Maps diff hash → review ID for returning cached results.
 *
 * Cache key is SHA-256(diff content + provider), so the same diff
 * reviewed with different providers gets cached separately.
 */
class CacheStore {
  private cache = new Map<string, string>();

  /**
   * Get the cached review ID for a given cache key.
   */
  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  /**
   * Store a cache mapping.
   */
  set(key: string, reviewId: string): void {
    this.cache.set(key, reviewId);
  }

  /**
   * Check if a cache key exists.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Build a cache key from diff hash and provider.
   */
  static buildKey(diffHash: string, provider: string): string {
    return `${provider}:${diffHash}`;
  }
}

export const cacheStore = new CacheStore();
