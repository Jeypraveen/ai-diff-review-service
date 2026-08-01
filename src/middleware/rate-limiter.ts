import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { RateLimitError } from '../utils/errors.js';
import { loadConfig } from '../config.js';
import { logger } from '../utils/logger.js';

const config = loadConfig();

/**
 * Token Bucket Rate Limiter — POST /v1/reviews only.
 * GETs are never rate limited.
 */
class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(maxTokens: number, windowMs: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = maxTokens / windowMs;
    this.lastRefill = Date.now();
  }

  consume(): { allowed: boolean; retryAfter?: number } {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true };
    }
    const retryAfterMs = (1 - this.tokens) / this.refillRate;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    return { allowed: false, retryAfter: retryAfterSeconds };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const bucket = new TokenBucket(config.rateLimitBurst, config.rateLimitWindowMs);

export function rateLimiterHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (request.method !== 'POST' || !request.url.startsWith('/v1/reviews')) {
    done();
    return;
  }

  const result = bucket.consume();
  if (!result.allowed) {
    logger.warn({ retryAfter: result.retryAfter }, 'Rate limit exceeded');
    const error = new RateLimitError(result.retryAfter!);
    reply
      .code(429)
      .header('Retry-After', String(result.retryAfter))
      .send(error.toEnvelope());
    return;
  }

  done();
}
