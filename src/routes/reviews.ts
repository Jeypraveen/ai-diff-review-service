import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { submitReview } from '../services/review-service.js';
import { storeIdempotencyResponse } from '../middleware/idempotency.js';
import { InvalidDiffError, PayloadTooLargeError } from '../utils/errors.js';

/**
 * Per spec body:
 * {
 *   "diff": "<unified diff, required>",
 *   "options": {
 *     "provider": "mock" | "llm",     // default "mock"
 *     "maxFindings": <int, default 100>
 *   }
 * }
 */
const reviewRequestSchema = z.object({
  diff: z.string(),
  options: z
    .object({
      provider: z.enum(['mock', 'llm']).default('mock'),
      maxFindings: z.number().int().min(0).default(100),
    })
    .default({}),
}).passthrough(); // Unknown fields are ignored per spec

export function registerReviewRoutes(app: FastifyInstance): void {
  app.post('/v1/reviews', async (request, reply) => {
    // Check payload size: > 1 MiB → 413
    const contentLength = parseInt(request.headers['content-length'] || '0', 10);
    if (contentLength > 1048576) {
      throw new PayloadTooLargeError();
    }

    const parseResult = reviewRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new InvalidDiffError('Diff is missing, empty, or not a valid unified diff');
    }

    const { diff, options } = parseResult.data;
    const { provider, maxFindings } = options;

    // diff missing or empty → 422
    if (!diff || diff.trim().length === 0) {
      throw new InvalidDiffError('Diff is missing or empty');
    }

    // Verify it looks like a unified diff (must contain diff headers/markers)
    const hasDiffHeaders = diff.includes('diff --git ') || diff.includes('diff ') || (diff.includes('--- ') && diff.includes('+++ '));
    if (!hasDiffHeaders) {
      throw new InvalidDiffError('Diff is missing, empty, or not a valid unified diff');
    }

    // Check diff byte size for 413
    if (Buffer.byteLength(diff, 'utf8') > 1048576) {
      throw new PayloadTooLargeError();
    }

    const { review, cached } = submitReview(diff, provider, maxFindings);

    // Per spec: 202 → { "jobId": "<opaque>", "status": "queued" }
    const responseBody: Record<string, unknown> = {
      jobId: review.jobId,
      status: review.status,
    };

    // If cached, include findings and usage immediately
    if (cached && review.status === 'done') {
      responseBody.findings = review.findings;
      responseBody.usage = review.usage;
    }

    const statusCode = cached ? 200 : 202;

    // Store idempotency response if key was provided
    const idempotencyKey = (request as any).idempotencyKey as string | undefined;
    if (idempotencyKey) {
      const bodyHash = (request as any).idempotencyBodyHash as string;
      storeIdempotencyResponse(idempotencyKey, bodyHash, review.jobId, statusCode, responseBody);
    }

    return reply.code(statusCode).send(responseBody);
  });
}
