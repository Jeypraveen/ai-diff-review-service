import type { SSEEvent, SSEEventType } from '../types/index.js';
import type { FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

type Subscriber = (event: SSEEvent) => void;

/**
 * SSE Manager — per spec:
 * - event `status` — at least on status transitions
 * - event `finding` — one per finding, as discovered
 * - event `done` — {"total": <count>, "usage": {...}}, then close
 * - Connecting to a finished job's stream must replay all events identically
 */
class SSEManager {
  private eventLogs = new Map<string, SSEEvent[]>();
  private subscribers = new Map<string, Set<Subscriber>>();

  emit(reviewId: string, event: SSEEventType, data: unknown): void {
    if (!this.eventLogs.has(reviewId)) {
      this.eventLogs.set(reviewId, []);
    }

    const eventLog = this.eventLogs.get(reviewId)!;
    const sseEvent: SSEEvent = {
      id: eventLog.length + 1,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    eventLog.push(sseEvent);

    const subs = this.subscribers.get(reviewId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(sseEvent);
        } catch (error) {
          logger.error({ error, reviewId }, 'SSE subscriber callback error');
        }
      }
    }
  }

  subscribe(reviewId: string, reply: FastifyReply, lastEventId?: number): void {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Replay all historical events (per spec: "replay all events identically")
    const eventLog = this.eventLogs.get(reviewId) || [];
    const startFrom = lastEventId ? lastEventId : 0;

    for (const event of eventLog) {
      if (event.id > startFrom) {
        this.writeSSE(reply, event);
      }
    }

    // If job is finished, close after replay
    const lastEvent = eventLog[eventLog.length - 1];
    if (lastEvent && lastEvent.event === 'done') {
      reply.raw.end();
      return;
    }

    // Register live subscriber
    const callback: Subscriber = (event) => {
      this.writeSSE(reply, event);
      if (event.event === 'done') {
        const subs = this.subscribers.get(reviewId);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) this.subscribers.delete(reviewId);
        }
        reply.raw.end();
      }
    };

    if (!this.subscribers.has(reviewId)) {
      this.subscribers.set(reviewId, new Set());
    }
    this.subscribers.get(reviewId)!.add(callback);

    reply.raw.on('close', () => {
      const subs = this.subscribers.get(reviewId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this.subscribers.delete(reviewId);
      }
    });
  }

  private writeSSE(reply: FastifyReply, event: SSEEvent): void {
    const data = JSON.stringify(event.data);
    reply.raw.write(`id: ${event.id}\n`);
    reply.raw.write(`event: ${event.event}\n`);
    reply.raw.write(`data: ${data}\n\n`);
  }

  getEvents(reviewId: string): SSEEvent[] {
    return this.eventLogs.get(reviewId) || [];
  }
}

export const sseManager = new SSEManager();
