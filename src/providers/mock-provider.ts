import type { AnalysisProvider, ParsedFile, Finding, AddedLine } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Mock analysis provider — deterministic rules scored exactly.
 *
 * Rules apply to added lines only (+ lines, excluding +++ header).
 * One finding per matching line per rule.
 * Finding id format: "RULE-ID:path:line"
 * Ordering: by path (lexicographic), then line (ascending), then ruleId
 */
export class MockProvider implements AnalysisProvider {
  public readonly name = 'mock' as const;

  async analyze(files: ParsedFile[]): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const file of files) {
      const allAddedLines = file.addedLines;

      for (let i = 0; i < allAddedLines.length; i++) {
        const addedLine = allAddedLines[i];
        const { lineNumber, content } = addedLine;

        // MOCK-001: eval usage
        if (content.includes('eval(')) {
          findings.push(makeFinding('MOCK-001', 'critical', 'security', 'eval usage', file.path, lineNumber, content));
        }

        // MOCK-002: hardcoded credential
        const credentialRegex = /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i;
        if (credentialRegex.test(content)) {
          findings.push(makeFinding('MOCK-002', 'critical', 'security', 'hardcoded credential', file.path, lineNumber, content));
        }

        // MOCK-003: SQL string concatenation
        if (hasSqlConcatenation(content)) {
          findings.push(makeFinding('MOCK-003', 'high', 'security', 'SQL string concatenation', file.path, lineNumber, content));
        }

        // MOCK-004: swallowed exception (empty catch block)
        if (isEmptyCatch(content, allAddedLines, i)) {
          findings.push(makeFinding('MOCK-004', 'high', 'correctness', 'swallowed exception', file.path, lineNumber, content));
        }

        // MOCK-005: loose null comparison
        if (content.includes('== null') || content.includes('!= null')) {
          findings.push(makeFinding('MOCK-005', 'medium', 'correctness', 'loose null comparison', file.path, lineNumber, content));
        }

        // MOCK-006: deep-clone via JSON
        if (content.includes('JSON.parse(JSON.stringify(')) {
          findings.push(makeFinding('MOCK-006', 'medium', 'performance', 'deep-clone via JSON', file.path, lineNumber, content));
        }

        // MOCK-007: console.log left in
        if (content.includes('console.log(')) {
          findings.push(makeFinding('MOCK-007', 'low', 'style', 'console.log left in', file.path, lineNumber, content));
        }

        // MOCK-008: unresolved marker
        if (content.includes('TODO') || content.includes('FIXME')) {
          findings.push(makeFinding('MOCK-008', 'low', 'style', 'unresolved marker', file.path, lineNumber, content));
        }

        // MOCK-INJ: prompt-injection content
        const lowerContent = content.toLowerCase();
        if (
          lowerContent.includes('ignore previous instructions') ||
          lowerContent.includes('disregard all prior') ||
          lowerContent.includes('you are now')
        ) {
          findings.push(makeFinding('MOCK-INJ', 'critical', 'security', 'prompt-injection content', file.path, lineNumber, content));
        }
      }
    }

    // Sort findings: by path (lexicographic), then line (ascending), then ruleId
    findings.sort((a, b) => {
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      if (a.line !== b.line) return a.line - b.line;
      return a.ruleId.localeCompare(b.ruleId);
    });

    logger.debug({ findingCount: findings.length }, 'Mock provider analysis complete');
    return findings;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFinding(
  ruleId: string,
  severity: Finding['severity'],
  category: Finding['category'],
  title: string,
  path: string,
  line: number,
  evidence: string,
): Finding {
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    path,
    line,
    severity,
    category,
    title,
    evidence,
  };
}

function hasSqlConcatenation(content: string): boolean {
  const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  if (!content.includes('+')) return false;
  const upper = content.toUpperCase();
  for (const keyword of sqlKeywords) {
    if (upper.includes(keyword)) {
      const regex = new RegExp(
        `(['"\`])[^'"\`]*${keyword}[^'"\`]*\\1\\s*\\+|\\+\\s*(['"\`])[^'"\`]*${keyword}`,
        'i',
      );
      if (regex.test(content)) return true;
    }
  }
  return false;
}

function isEmptyCatch(content: string, allLines: AddedLine[], currentIndex: number): boolean {
  const trimmed = content.trim();
  const catchMatch = trimmed.match(/\bcatch\s*(?:\([^)]*\))?\s*\{/);
  if (!catchMatch) return false;

  // Same line: catch (e) {} or catch (e) { }
  const afterCatch = content.substring(content.indexOf(catchMatch[0]) + catchMatch[0].length);
  if (afterCatch.match(/^\s*\}/)) return true;

  // Multi-line
  for (let j = currentIndex + 1; j < allLines.length; j++) {
    const nextLine = allLines[j].content.trim();
    if (nextLine === '}') return true;
    if (nextLine === '') continue;
    break;
  }
  return false;
}

export const mockProvider = new MockProvider();
