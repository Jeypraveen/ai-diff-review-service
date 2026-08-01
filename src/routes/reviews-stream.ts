import type { FastifyInstance } from 'fastify';
import { reviewStore } from '../stores/review-store.js';
import { sseManager } from '../services/sse-manager.js';
import { NotFoundError } from '../utils/errors.js';

export function registerReviewStreamRoutes(app: FastifyInstance): void {
  /**
   * GET /v1/reviews/:id/stream — SSE stream for real-time review progress
   *
   * Supports Last-Event-ID header for replay.
   * Streams historical events first, then live events.
   * Closes on 'complete' or 'error' events.
   */
  app.get<{ Params: { id: string } }>(
    '/v1/reviews/:id/stream',
    async (request, reply) => {
      const { id } = request.params;
      const review = reviewStore.get(id);

      if (!review) {
        throw new NotFoundError('Review', id);
      }

      // Parse Last-Event-ID for replay
      const lastEventIdHeader = request.headers['last-event-id'] as
        | string
        | undefined;
      const lastEventId = lastEventIdHeader
        ? parseInt(lastEventIdHeader, 10)
        : undefined;

      // Subscribe to SSE events (handles replay + live streaming)
      sseManager.subscribe(id, reply, lastEventId);

      // Prevent Fastify from sending a response (SSE is handled manually)
      return reply;
    },
  );
}
