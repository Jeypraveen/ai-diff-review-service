import type { AnalysisProvider, ParsedFile, Finding } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { InternalError } from '../utils/errors.js';

/**
 * LLM analysis provider using Groq API (free tier).
 * Model: llama-3.1-70b-versatile
 *
 * Gracefully degrades if Groq is unavailable or misconfigured.
 */
export class LLMProvider implements AnalysisProvider {
  public readonly name = 'llm' as const;
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private model = 'llama-3.3-70b-versatile';
  private timeoutMs = 25000; // 25s to stay within 30s budget

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(files: ParsedFile[]): Promise<Finding[]> {
    if (!this.apiKey) {
      throw new InternalError(
        'LLM provider is not configured: GROQ_API_KEY is missing',
      );
    }

    // Build the prompt with file contents
    const fileContents = files
      .map((f) => {
        const lines = f.addedLines
          .map((l) => `L${l.lineNumber}: ${l.content}`)
          .join('\n');
        return `File: ${f.path}\nAdded lines:\n${lines}`;
      })
      .join('\n\n---\n\n');

    const prompt = `You are a code review assistant. Analyze the following added lines from a code diff and report any issues found.

For each issue, return a JSON object with these exact fields:
- ruleId: a descriptive ID (e.g., "LLM-SEC-001")
- severity: one of "critical", "high", "medium", "low"
- category: one of "security", "correctness", "performance", "style"
- title: a short descriptive title
- file: the file path
- line: the line number in the new file
- snippet: the content of the problematic line

Look for:
- Security issues (eval, hardcoded credentials, SQL injection, XSS)
- Correctness issues (null checks, error handling, type errors)
- Performance issues (unnecessary copies, N+1 queries, memory leaks)
- Style issues (console.log, TODO/FIXME markers, naming conventions)

Return ONLY a JSON array of findings. If no issues found, return an empty array [].

${fileContents}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a precise code review tool. Return only valid JSON arrays. Do not include markdown formatting.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        logger.error(
          { status: response.status, body: errorBody },
          'Groq API error',
        );
        throw new InternalError(
          `LLM provider returned ${response.status}: ${errorBody}`,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        logger.warn('LLM returned empty content');
        return [];
      }

      // Parse the JSON response — handle markdown code blocks
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        logger.warn({ parsed }, 'LLM returned non-array response');
        return [];
      }

      // Validate and type-check each finding
      const findings: Finding[] = parsed
        .filter(
          (f: any): f is any =>
            typeof f === 'object' &&
            f !== null &&
            'ruleId' in f &&
            'severity' in f &&
            'title' in f &&
            ('file' in f || 'path' in f) &&
            'line' in f,
        )
        .map((f: any) => {
          const path = String(f.path || f.file || '');
          const line = Number(f.line);
          const ruleId = String(f.ruleId);
          return {
            id: `${ruleId}:${path}:${line}`,
            ruleId,
            path,
            line,
            severity: validateSeverity(f.severity),
            category: validateCategory(f.category),
            title: String(f.title),
            evidence: String(f.evidence || f.snippet || ''),
          };
        });

      logger.info(
        { findingCount: findings.length },
        'LLM provider analysis complete',
      );
      return findings;
    } catch (error) {
      if (error instanceof InternalError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new InternalError('LLM provider timed out after 25 seconds');
      }

      logger.error({ error }, 'LLM provider failed');
      throw new InternalError(
        `LLM provider error: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

function validateSeverity(s: string): Finding['severity'] {
  const valid = ['critical', 'high', 'medium', 'low'];
  return valid.includes(s) ? (s as Finding['severity']) : 'medium';
}

function validateCategory(c: string): Finding['category'] {
  const valid = ['security', 'correctness', 'performance', 'style'];
  return valid.includes(c) ? (c as Finding['category']) : 'correctness';
}
