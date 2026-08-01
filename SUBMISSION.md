# SUBMISSION.md — AI Diff Review Service

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Fastify HTTP Server         │
                    │  ┌───────┐ ┌──────────┐ ┌────────┐  │
                    │  │ Auth  │→│Rate Limit│→│Idempot.│  │
                    │  └───────┘ └──────────┘ └────────┘  │
                    ├─────────────────────────────────────┤
                    │           Route Handlers            │
                    │  GET  /health                       │
                    │  GET  /spec                         │
                    │  POST /v1/reviews                   │
                    │  GET  /v1/reviews/:id               │
                    │  GET  /v1/reviews/:id/stream  (SSE) │
                    ├─────────────────────────────────────┤
                    │          ReviewService              │
                    │  parse → chunk → analyze → merge    │
                    ├────────────┬────────────────────────┤
                    │ WorkerPool │     SSE Manager        │
                    │ (4 slots)  │  (event log + replay)  │
                    ├────────────┼────────────────────────┤
                    │ Providers  │      Stores            │
                    │ ├─ Mock    │  ├─ ReviewStore        │
                    │ └─ LLM     │  ├─ CacheStore         │
                    │  (Groq)    │  └─ IdempotencyStore   │
                    └────────────┴────────────────────────┘
```

The service is a layered Fastify application with three middleware stages (auth → rate limit → idempotency) feeding into route handlers. The `ReviewService` orchestrates the pipeline: it hashes the diff for cache lookup, creates a job, submits it to a bounded worker pool, and the worker parses the diff, chunks it on file boundaries, runs the selected provider against each chunk, merges findings (deduplicating by `RULE-ID:path:line`), and persists the result. SSE events are emitted at each lifecycle stage and stored in a per-job event log for replay.

> [!NOTE]
> All custom errors map directly to the specified machine-readable error codes (`unauthorized`, `payload_too_large`, `invalid_json`, `invalid_diff`, `idempotency_conflict`, `not_found`, `rate_limited`, `internal`) inside standard error envelopes.

---

## Provider Design

I used the **Strategy Pattern**: both `MockProvider` and `LLMProvider` implement a shared `AnalysisProvider` interface (`analyze(files) → findings`, `healthCheck()`). The `ReviewService` selects the provider by name and calls it identically.

- **Mock**: Deterministic, standalone, and executes in-memory. Implements all 9 rules exactly (including MOCK-INJ prompt injection detection which treats injections as inert findings without changing pipeline execution).
- **LLM**: Real AI code path calling the **Groq API** (Llama 3.3 70B model). Gracefully degrades: if the API key is missing or the call fails, it throws a typed `InternalError` that maps to HTTP 500 — preventing server crashes and ensuring predictable failures.
- **Extensibility**: Adding a new provider (e.g., OpenAI or Anthropic) requires writing a class implementing `AnalysisProvider` and registering it in `ReviewService` — no pipeline modifications needed.

---

## Cross-Cutting Behavior Verification

| Behavior | How I Verified |
|---|---|
| **Chunking** | Verified that diffs over 64 KiB split correctly on file boundaries. Wrote unit tests confirming that oversized files get their own chunk, file order is preserved, and combined findings are identical to an unchunked scan without duplicate findings or loss of context. |
| **Caching** | Wrote tests verifying that submitting a byte-identical request body yields a `200 OK` response immediately, returning the findings with `usage.cacheHit` set to `true`. |
| **Idempotency** | Verified that sending the same `Idempotency-Key` with the same body yields the identical `jobId` and response. Sending the same key with a different body returns `409 Conflict` with the `idempotency_conflict` error envelope. |
| **SSE Replay** | Verified that connecting to `GET /v1/reviews/:id/stream` streams events sequentially with 1-based IDs (`status`, `finding`, `done`). Reconnecting with the `Last-Event-ID` header successfully replays only the missing events. Replaying completed reviews delivers historical events and closes immediately. |
| **Rate Limiting** | Wrote token-bucket rate limiter that restricts POST requests to 30 req/min (sustained) and 35 (burst). Excess requests get `429 Too Many Requests` with a precise `Retry-After` header. Checked that GET requests are never rate limited. |
| **Concurrency** | Tested by spawning 5 simultaneous jobs. Verified that 4 process concurrently while the 5th queues and starts as soon as a slot is released. No jobs crash or fail. |

---

## AI Tools Used

- **Gemini (Antigravity IDE)** — Used for code generation, architecture design, unit test writing, and debugging. I used it to scaffold Fastify route registrations, build the unified diff parsing logic, and generate deterministic mock rules.

---

## AI Suggestion Rejected

> [!IMPORTANT]
> **Rejected: Using `express-rate-limit` npm package for rate limiting.**

The AI suggested installing the `express-rate-limit` middleware. I rejected this because:
1. **Compatibility**: It's designed for Express and requires adapters for Fastify, increasing overhead.
2. **Algorithm Limitations**: It uses fixed-window rate limiting which allows double the rate limit at window boundaries. I implemented a robust **Token Bucket** algorithm instead, which refills tokens continuously and guarantees smooth rate limiting.
3. **Control**: The spec requires a precise `Retry-After` header containing integer seconds. Standard packages do not offer the customization needed to compute dynamic cooldowns reliably.
4. **Engineering Integrity**: Building this from scratch demonstrates a complete understanding of concurrency control and rate-limiting patterns.

---

## What I'd Do With More Time

1. **Persistent Storage**: Transition from in-memory Maps to Redis (for rate limiter buckets, job statuses, idempotency keys, and caches) and PostgreSQL (for persistent reviews and findings metadata) to allow horizontal scaling.
2. **Distributed Rate Limiting**: Implement a Redis-backed sliding window with Lua scripts for atomic token consumption.
3. **Structured Contextual LLM Prompting**: Implement few-shot examples and schema-based JSON outputs (e.g., OpenAI/Groq structured outputs) to guarantee the LLM strictly conforms to the finding model.
4. **Tracing & Observability**: Instrument request life cycles with OpenTelemetry to trace jobs across the worker pool and SSE streaming.
