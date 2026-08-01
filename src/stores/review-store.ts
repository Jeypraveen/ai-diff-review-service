import type { Review, ReviewStatus, Finding, Usage } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * In-memory store for review jobs.
 * Maps jobId → Review object.
 */
class ReviewStore {
  private reviews = new Map<string, Review>();

  create(diff: string, diffHash: string, provider: 'mock' | 'llm', maxFindings: number = 100): Review {
    const now = new Date().toISOString();
    const review: Review = {
      jobId: uuidv4(),
      status: 'queued',
      provider,
      diff,
      diffHash,
      maxFindings,
      findings: [],
      usage: { inputBytes: Buffer.byteLength(diff, 'utf8'), chunks: 0, cacheHit: false },
      createdAt: now,
      updatedAt: now,
    };

    this.reviews.set(review.jobId, review);
    return review;
  }

  get(jobId: string): Review | undefined {
    return this.reviews.get(jobId);
  }

  updateStatus(jobId: string, status: ReviewStatus): void {
    const review = this.reviews.get(jobId);
    if (review) {
      review.status = status;
      review.updatedAt = new Date().toISOString();
    }
  }

  setFindings(jobId: string, findings: Finding[], usage: Usage): void {
    const review = this.reviews.get(jobId);
    if (review) {
      review.findings = findings;
      review.usage = usage;
      review.status = 'done';
      review.updatedAt = new Date().toISOString();
      review.completedAt = new Date().toISOString();
    }
  }

  setError(jobId: string, error: string): void {
    const review = this.reviews.get(jobId);
    if (review) {
      review.status = 'failed';
      review.error = error;
      review.updatedAt = new Date().toISOString();
    }
  }
}

export const reviewStore = new ReviewStore();
