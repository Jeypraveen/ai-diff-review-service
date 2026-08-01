import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loadConfig } from '../config.js';
import { UnauthorizedError } from '../utils/errors.js';

const config = loadConfig();

/**
 * Auth middleware — validates Bearer token on all /v1/* routes.
 *
 * Per spec: Missing/wrong token → 401 with error envelope.
 * /health and /spec are public.
 */
export function registerAuthHook(app: FastifyInstance): void {
  app.addHook(
    'onRequest',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      // Only protect /v1/* routes — /health and /spec are public
      if (!request.url.startsWith('/v1')) return;

      const authHeader = request.headers.authorization;

      if (!authHeader) {
        throw new UnauthorizedError('Missing Authorization header');
      }

      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new UnauthorizedError('Invalid Authorization header format');
      }

      const token = parts[1];
      if (token !== config.bearerToken) {
        // Per spec: wrong token is also 401, not 403
        throw new UnauthorizedError('Invalid bearer token');
      }
    },
  );
}
