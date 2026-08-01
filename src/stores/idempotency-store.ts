/**
 * In-memory idempotency store.
 * Maps Idempotency-Key → stored response data.
 *
 * If the same idempotency key is sent with the same diff,
 * return the original response without creating a new review.
 *
 * If the same key is sent with a different diff, return 409 Conflict.
 */

export interface IdempotencyEntry {
  /** The review ID that was created */
  reviewId: string;
  /** The diff hash that was submitted */
  diffHash: string;
  /** The full response body to return */
  responseBody: unknown;
  /** HTTP status code */
  statusCode: number;
}

class IdempotencyStore {
  private store = new Map<string, IdempotencyEntry>();

  get(key: string): IdempotencyEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: IdempotencyEntry): void {
    this.store.set(key, entry);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

export const idempotencyStore = new IdempotencyStore();
