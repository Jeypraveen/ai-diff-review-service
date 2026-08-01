import type { FastifyInstance } from 'fastify';

const startTime = Date.now();

export function registerHealthRoutes(app: FastifyInstance): void {
  /**
   * GET /health (public)
   *
   * Per spec: 200 → { "status": "ok", "version": "<semver>", "uptimeSeconds": <number> }
   */
  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    });
  });
}
