import type { FastifyInstance } from 'fastify';
import { reviewStore } from '../stores/review-store.js';
import { NotFoundError } from '../utils/errors.js';

export function registerReviewGetRoutes(app: FastifyInstance): void {
  /**
   * GET /v1/reviews/{jobId}
   *
   * Per spec: 200 →
   * {
   *   "jobId": "...",
   *   "status": "queued" | "running" | "done" | "failed",
   *   "findings": [ ... ],          // when done
   *   "usage": { "inputBytes": <int>, "chunks": <int>, "cacheHit": <bool> }
   * }
   */
  app.get<{ Params: { id: string } }>(
    '/v1/reviews/:id',
    async (request, reply) => {
      const { id } = request.params;
      const review = reviewStore.get(id);

      if (!review) {
        throw new NotFoundError('Review', id);
      }

      const response: Record<string, unknown> = {
        jobId: review.jobId,
        status: review.status,
      };

      // Include findings and usage when done
      if (review.status === 'done') {
        response.findings = review.findings;
        response.usage = review.usage;
      }

      // Include usage in all states (inputBytes, chunks, cacheHit)
      if (review.status !== 'done') {
        response.usage = review.usage;
      }

      // Include error when failed
      if (review.status === 'failed' && review.error) {
        response.error = { code: 'internal', message: review.error };
      }

      return reply.code(200).send(response);
    },
  );
}
