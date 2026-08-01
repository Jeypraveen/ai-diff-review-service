import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';

const config = loadConfig();

export function registerSpecRoutes(app: FastifyInstance): void {
  /**
   * GET /spec (public — NOT under /v1)
   *
   * Per spec: machine-readable self-declaration.
   * Declared limits must match actual behavior.
   */
  app.get('/spec', async (_request, reply) => {
    return reply.code(200).send({
      specVersion: '1.0',
      providers: ['mock', 'llm'],
      limits: {
        maxPayloadBytes: 1048576,           // 1 MiB
        chunkBytes: 65536,                  // 64 KiB
        maxConcurrentJobs: config.maxConcurrency,
        rateLimitPerMinute: config.rateLimitMaxRequests,
      },
    });
  });
}
