import type { Finding, ProviderName, Review, Usage } from '../types/index.js';
import { parseDiff } from './diff-parser.js';
import { chunkFiles } from './chunking-engine.js';
import { mergeFindings } from './findings-merger.js';
import { workerPool } from './worker-pool.js';
import { sseManager } from './sse-manager.js';
import { reviewStore } from '../stores/review-store.js';
import { cacheStore } from '../stores/cache-store.js';
import { mockProvider } from '../providers/mock-provider.js';
import { LLMProvider } from '../providers/llm-provider.js';
import { hashDiff } from '../utils/hash.js';
import { logger } from '../utils/logger.js';
import { loadConfig } from '../config.js';

const config = loadConfig();
const llmProvider = new LLMProvider(config.groqApiKey);

/**
 * Main orchestrator for the review pipeline.
 */
export function submitReview(
  diff: string,
  provider: ProviderName = 'mock',
  maxFindings: number = 100,
): { review: Review; cached: boolean } {
  const diffHash = hashDiff(diff);
  const cacheKey = `${provider}:${diffHash}`;
  const inputBytes = Buffer.byteLength(diff, 'utf8');

  // ── Cache check ──
  const cachedReviewId = cacheStore.get(cacheKey);
  if (cachedReviewId) {
    const cachedReview = reviewStore.get(cachedReviewId);
    if (cachedReview && cachedReview.status === 'done') {
      logger.info({ jobId: cachedReviewId }, 'Cache hit');

      const newReview = reviewStore.create(diff, diffHash, provider, maxFindings);
      const { findings, totalCount } = mergeFindings([cachedReview.findings], maxFindings);
      reviewStore.setFindings(newReview.jobId, findings, {
        inputBytes,
        chunks: cachedReview.usage.chunks,
        cacheHit: true,
      });

      // SSE events for cached review
      sseManager.emit(newReview.jobId, 'status', { jobId: newReview.jobId, status: 'queued' });
      sseManager.emit(newReview.jobId, 'status', { jobId: newReview.jobId, status: 'done' });
      for (const f of findings) {
        sseManager.emit(newReview.jobId, 'finding', f);
      }
      sseManager.emit(newReview.jobId, 'done', {
        total: findings.length,
        usage: { inputBytes, chunks: cachedReview.usage.chunks, cacheHit: true },
      });

      return { review: reviewStore.get(newReview.jobId)!, cached: true };
    }
  }

  // ── Create new review ──
  const review = reviewStore.create(diff, diffHash, provider, maxFindings);
  logger.info({ jobId: review.jobId, provider, diffSize: diff.length }, 'Review created');

  // Emit queued status
  sseManager.emit(review.jobId, 'status', { jobId: review.jobId, status: 'queued' });

  // ── Submit to worker pool ──
  workerPool.submit(async () => {
    try {
      // Update status to running
      reviewStore.updateStatus(review.jobId, 'running');
      sseManager.emit(review.jobId, 'status', { jobId: review.jobId, status: 'running' });

      const files = parseDiff(diff);
      const chunks = chunkFiles(files);
      const chunkCount = chunks.length;

      logger.info({ jobId: review.jobId, fileCount: files.length, chunkCount }, 'Diff parsed');

      // Analyze each chunk
      const selectedProvider = provider === 'llm' ? llmProvider : mockProvider;
      const chunkFindings: Finding[][] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const findings = await selectedProvider.analyze(chunk.files);
        chunkFindings.push(findings);
      }

      // Merge findings
      const { findings, totalCount } = mergeFindings(chunkFindings, maxFindings);

      const usage: Usage = {
        inputBytes,
        chunks: chunkCount,
        cacheHit: false,
      };

      reviewStore.setFindings(review.jobId, findings, usage);
      cacheStore.set(cacheKey, review.jobId);

      // Emit finding events — one per finding
      for (const f of findings) {
        sseManager.emit(review.jobId, 'finding', f);
      }

      // Emit done event
      sseManager.emit(review.jobId, 'done', {
        total: findings.length,
        usage,
      });

      logger.info({ jobId: review.jobId, findings: findings.length, chunks: chunkCount }, 'Review done');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ jobId: review.jobId, error }, 'Review failed');
      reviewStore.setError(review.jobId, errorMsg);
      sseManager.emit(review.jobId, 'status', { jobId: review.jobId, status: 'failed', error: errorMsg });
      // Also emit done so SSE connections close
      sseManager.emit(review.jobId, 'done', { total: 0, usage: review.usage, error: errorMsg });
    }
  });

  return { review, cached: false };
}
