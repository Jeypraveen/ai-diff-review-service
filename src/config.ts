export interface Config {
  port: number;
  nodeEnv: string;
  bearerToken: string;
  groqApiKey: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitBurst: number;
  maxChunkSizeBytes: number;
  maxConcurrency: number;
}

export function loadConfig(): Config {
  const bearerToken = process.env.BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error('BEARER_TOKEN environment variable is required');
  }

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    bearerToken,
    groqApiKey: process.env.GROQ_API_KEY || '',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10),
    rateLimitBurst: parseInt(process.env.RATE_LIMIT_BURST || '35', 10),
    maxChunkSizeBytes: 64 * 1024, // 64 KiB — per spec, not configurable
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '4', 10),
  };
}
