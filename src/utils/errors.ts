// ─── Base Error ──────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  /** Format as the standard error envelope per spec */
  toEnvelope() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

// ─── Specific Errors (codes match spec exactly) ──────────────────────────────
// Codes: unauthorized, payload_too_large, invalid_json, invalid_diff,
//        idempotency_conflict, not_found, rate_limited, internal

/** 401 — missing OR wrong token → always 401 per spec */
export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid bearer token') {
    super(message, 401, 'unauthorized');
  }
}

/** 404 — resource not found */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, 404, 'not_found');
  }
}

/** 400 — invalid JSON body */
export class InvalidJsonError extends AppError {
  constructor(message = 'Invalid JSON in request body') {
    super(message, 400, 'invalid_json');
  }
}

/** 422 — diff missing, empty, or not parseable */
export class InvalidDiffError extends AppError {
  constructor(message = 'Diff is missing, empty, or not a valid unified diff') {
    super(message, 422, 'invalid_diff');
  }
}

/** 413 — payload too large */
export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload exceeds 1 MiB limit') {
    super(message, 413, 'payload_too_large');
  }
}

/** 429 — rate limit exceeded */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded', 429, 'rate_limited');
    this.retryAfter = retryAfterSeconds;
  }
}

/** 409 — idempotency key reuse with different body */
export class IdempotencyConflictError extends AppError {
  constructor(message = 'Idempotency key already used with a different request body') {
    super(message, 409, 'idempotency_conflict');
  }
}

/** 500 — internal server error */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'internal');
  }
}
