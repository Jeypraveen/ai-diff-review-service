# AI Diff Review Service

An AI-powered code diff review service that analyzes unified diffs for security vulnerabilities, correctness issues, performance problems, and style violations.

Built for the Xsolla AI-First Engineering Intern Assessment.

## Features

- **Dual Provider Architecture**: Mock (deterministic, scored) and LLM (Groq API) providers
- **Asynchronous Processing**: Submit diffs and poll for results or stream via SSE
- **Smart Chunking**: Diffs > 64 KiB split on file boundaries, findings merged seamlessly
- **SSE with Replay**: Real-time progress streaming with `Last-Event-ID` replay support
- **Caching**: Same diff → cached results (SHA-256 content hashing)
- **Idempotency**: Duplicate-safe submissions via `Idempotency-Key` header
- **Rate Limiting**: Token bucket algorithm, 30/min sustained with burst support
- **Concurrency**: 4 parallel workers with overflow queue

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Fastify 5 |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| LLM | Groq API (free tier, Llama 3.3 70B) |
| Deployment | Render.com (free) |

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your BEARER_TOKEN and GROQ_API_KEY

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
npm start
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | ❌ | Health check |
| `GET` | `/spec` | ❌ | Service capabilities declaration |
| `POST` | `/v1/reviews` | ✅ | Submit a diff for review |
| `GET` | `/v1/reviews/:id` | ✅ | Poll review status and results |
| `GET` | `/v1/reviews/:id/stream` | ✅ | SSE stream for real-time progress |

### Submit a Review

```bash
curl -X POST http://localhost:3000/v1/reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "diff": "diff --git a/test.js b/test.js\n--- a/test.js\n+++ b/test.js\n@@ -1,2 +1,3 @@\n function hello() {\n+  eval(userInput);\n }",
    "options": {
      "provider": "mock",
      "maxFindings": 100
    }
  }'
```

### Poll Results

```bash
curl http://localhost:3000/v1/reviews/REVIEW_JOB_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Stream Events (SSE)

```bash
curl http://localhost:3000/v1/reviews/REVIEW_JOB_ID/stream \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: text/event-stream"
```

## Mock Rules

| Rule ID | Severity | Category | Trigger (on added lines) | Title |
|---|---|---|---|---|
| MOCK-001 | critical | security | contains `eval(` | eval usage |
| MOCK-002 | critical | security | matches hardcoded credentials regex | hardcoded credential |
| MOCK-003 | high | security | SQL keyword inside a string concatenated with `+` | SQL string concatenation |
| MOCK-004 | high | correctness | empty catch block | swallowed exception |
| MOCK-005 | medium | correctness | contains `== null` or `!= null` | loose null comparison |
| MOCK-006 | medium | performance | contains `JSON.parse(JSON.stringify(` | deep-clone via JSON |
| MOCK-007 | low | style | contains `console.log(` | console.log left in |
| MOCK-008 | low | style | contains `TODO` or `FIXME` | unresolved marker |
| MOCK-INJ | critical | security | contains prompt-injection phrases | prompt-injection content |

## Project Structure

```
src/
├── index.ts              # Server entry point
├── config.ts             # Environment config
├── middleware/           # Auth, rate limiting, idempotency
├── routes/               # API route handlers
├── services/             # Core business logic
├── providers/            # Mock and LLM analysis providers
├── stores/               # In-memory data stores
├── utils/                # Logger, errors, hashing
└── types/                # TypeScript interfaces
```

## License

Private — Xsolla Assessment Submission 
