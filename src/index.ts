import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { logger } from './utils/logger.js';
import { AppError, InvalidJsonError } from './utils/errors.js';
import { registerAuthHook } from './middleware/auth.js';
import { rateLimiterHook } from './middleware/rate-limiter.js';
import { idempotencyHook } from './middleware/idempotency.js';
import { registerReviewRoutes } from './routes/reviews.js';
import { registerReviewGetRoutes } from './routes/reviews-get.js';
import { registerReviewStreamRoutes } from './routes/reviews-stream.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSpecRoutes } from './routes/spec.js';

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: false,
    bodyLimit: 1048576 + 1024, // slightly over 1 MiB to let our handler check and return 413
  });

  // ── CORS ──
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // ── Global Middleware ──
  registerAuthHook(app);
  app.addHook('onRequest', rateLimiterHook);
  app.addHook('preHandler', idempotencyHook);

  // ── Routes ──
  registerHealthRoutes(app);       // GET /health (public)
  registerSpecRoutes(app);         // GET /spec (public — NOT under /v1)
  registerReviewRoutes(app);       // POST /v1/reviews
  registerReviewGetRoutes(app);    // GET /v1/reviews/:id
  registerReviewStreamRoutes(app); // GET /v1/reviews/:id/stream

  // ── Global Error Handler ──
  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toEnvelope());
    }

    // Fastify JSON parse errors → 400 invalid_json
    if (error.message && error.message.includes('JSON')) {
      return reply.code(400).send({
        error: { code: 'invalid_json', message: 'Invalid JSON in request body' },
      });
    }

    // Fastify validation errors → 422
    if (error.validation) {
      return reply.code(422).send({
        error: { code: 'invalid_diff', message: 'Request validation failed' },
      });
    }

    // Fastify body too large
    if (error.statusCode === 413) {
      return reply.code(413).send({
        error: { code: 'payload_too_large', message: 'Payload exceeds 1 MiB limit' },
      });
    }

    // Unexpected errors → 500
    logger.error({ error: error.message, stack: error.stack }, 'Unhandled error');
    return reply.code(500).send({
      error: { code: 'internal', message: 'An unexpected error occurred' },
    });
  });

  // ── 404 Handler ──
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      error: { code: 'not_found', message: 'Route not found' },
    });
  });

  // ── Start Server ──
  try {
    const address = await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    logger.info(`🚀 AI Diff Review Service running at ${address}`);
    logger.info(`   Environment: ${config.nodeEnv}`);
    logger.info(`   Rate limit: ${config.rateLimitMaxRequests}/min (burst: ${config.rateLimitBurst})`);
    logger.info(`   Max concurrency: ${config.maxConcurrency}`);
    logger.info(`   LLM provider: ${config.groqApiKey ? 'configured' : 'not configured'}`);
  } catch (err) {
    logger.fatal({ error: err }, 'Failed to start server');
    process.exit(1);
  }

  // ── Graceful Shutdown ──
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      logger.error({ error: err }, 'Shutdown error');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
