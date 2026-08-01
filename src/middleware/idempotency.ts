import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { idempotencyStore } from '../stores/idempotency-store.js';
import { hashDiff } from '../utils/hash.js';
import { IdempotencyConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotency middleware.
 *
 * Per spec: header `Idempotency-Key: <key>`
 * - Same key + byte-identical body → same jobId
 * - Same key + different body → 409 idempotency_conflict
 */
export function idempotencyHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (request.method !== 'POST' || !request.url.startsWith('/v1/reviews')) {
    done();
    return;
  }

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) {
    done();
    return;
  }

  // Hash the raw body for comparison
  const rawBody = JSON.stringify(request.body);
  const bodyHash = hashDiff(rawBody);

  const existing = idempotencyStore.get(idempotencyKey);
  if (existing) {
    if (existing.diffHash === bodyHash) {
      logger.info({ idempotencyKey, jobId: existing.reviewId }, 'Idempotency hit');
      reply.code(existing.statusCode).send(existing.responseBody);
      return;
    }

    logger.warn({ idempotencyKey }, 'Idempotency conflict');
    const error = new IdempotencyConflictError();
    reply.code(409).send(error.toEnvelope());
    return;
  }

  (request as any).idempotencyKey = idempotencyKey;
  (request as any).idempotencyBodyHash = bodyHash;
  done();
}

/**
 * Store the response for an idempotency key after the route handler completes.
 */
export function storeIdempotencyResponse(
  idempotencyKey: string,
  bodyHash: string,
  reviewId: string,
  statusCode: number,
  responseBody: unknown,
): void {
  idempotencyStore.set(idempotencyKey, {
    reviewId,
    diffHash: bodyHash,
    statusCode,
    responseBody,
  });
}
