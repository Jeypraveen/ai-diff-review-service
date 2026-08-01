// ─── Review Status ───────────────────────────────────────────────────────────

/** Per spec: queued | running | done | failed */
export type ReviewStatus = 'queued' | 'running' | 'done' | 'failed';

export type ProviderName = 'mock' | 'llm';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Category = 'security' | 'correctness' | 'performance' | 'style';

// ─── Finding ─────────────────────────────────────────────────────────────────

/**
 * Per spec:
 * {
 *   "id": "MOCK-003:src/db.ts:41",
 *   "ruleId": "MOCK-003",
 *   "path": "src/db.ts",
 *   "line": 41,
 *   "severity": "...",
 *   "category": "...",
 *   "title": "<short>",
 *   "evidence": "<the offending added line, verbatim>"
 * }
 */
export interface Finding {
  /** Format: "RULE-ID:path:line" */
  id: string;
  ruleId: string;
  path: string;
  line: number;
  severity: Severity;
  category: Category;
  title: string;
  evidence: string;
}

// ─── Usage ───────────────────────────────────────────────────────────────────

/**
 * Per spec:
 * { "inputBytes": <int>, "chunks": <int>, "cacheHit": <bool> }
 */
export interface Usage {
  /** Byte size of the input diff */
  inputBytes: number;
  /** Number of chunks the diff was split into */
  chunks: number;
  /** Whether the result was served from cache */
  cacheHit: boolean;
}

// ─── Review ──────────────────────────────────────────────────────────────────

export interface Review {
  jobId: string;
  status: ReviewStatus;
  provider: ProviderName;
  diff: string;
  diffHash: string;
  maxFindings: number;
  findings: Finding[];
  usage: Usage;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

// ─── API Request / Response ──────────────────────────────────────────────────

/**
 * Per spec:
 * {
 *   "diff": "<unified diff>",
 *   "options": {
 *     "provider": "mock" | "llm",
 *     "maxFindings": <int, default 100>
 *   }
 * }
 */
export interface ReviewRequest {
  diff: string;
  options?: {
    provider?: ProviderName;
    maxFindings?: number;
  };
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

// ─── Diff Parsing ────────────────────────────────────────────────────────────

export interface AddedLine {
  /** Line number in the new file */
  lineNumber: number;
  /** Content of the line (without the leading +) */
  content: string;
}

export interface ParsedFile {
  /** File path from the +++ header */
  path: string;
  /** All added lines with their new-file line numbers */
  addedLines: AddedLine[];
  /** Raw diff text for this file (for byte-size calculation) */
  rawDiff: string;
}

// ─── Chunking ────────────────────────────────────────────────────────────────

export interface Chunk {
  /** Chunk index (0-based) */
  index: number;
  /** Files in this chunk */
  files: ParsedFile[];
}

// ─── SSE Events ──────────────────────────────────────────────────────────────

/**
 * Per spec:
 * - event `status` — at least on status transitions
 * - event `finding` — one per finding, as discovered
 * - event `done` — { "total": <count>, "usage": {...} }, then close
 */
export type SSEEventType = 'status' | 'finding' | 'done';

export interface SSEEvent {
  /** Sequential event ID for Last-Event-ID replay */
  id: number;
  /** Event type: status | finding | done */
  event: SSEEventType;
  /** Event payload (JSON-serializable) */
  data: unknown;
  /** ISO timestamp */
  timestamp: string;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface AnalysisProvider {
  name: ProviderName;
  analyze(files: ParsedFile[]): Promise<Finding[]>;
  healthCheck(): Promise<boolean>;
}
