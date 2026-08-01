import { logger } from '../utils/logger.js';

type Task = () => Promise<void>;

/**
 * Worker pool for concurrent job processing.
 *
 * Per spec:
 * - At least 4 jobs processing concurrently
 * - A queued 5th must not fail (it waits in the queue)
 */
export class WorkerPool {
  private maxConcurrency: number;
  private activeCount = 0;
  private queue: Task[] = [];

  constructor(maxConcurrency = 4) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Submit a task for execution.
   * If under the concurrency limit, runs immediately.
   * Otherwise, queues it for later execution.
   */
  submit(task: Task): void {
    if (this.activeCount < this.maxConcurrency) {
      this.run(task);
    } else {
      logger.debug(
        { queueSize: this.queue.length + 1, activeCount: this.activeCount },
        'Task queued (pool at capacity)',
      );
      this.queue.push(task);
    }
  }

  private async run(task: Task): Promise<void> {
    this.activeCount++;
    try {
      await task();
    } catch (error) {
      logger.error({ error }, 'Worker task failed');
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const next = this.queue.shift()!;
      this.run(next);
    }
  }

  /** Current number of active workers */
  getActiveCount(): number {
    return this.activeCount;
  }

  /** Current queue depth */
  getQueueSize(): number {
    return this.queue.length;
  }
}

export const workerPool = new WorkerPool(4);
