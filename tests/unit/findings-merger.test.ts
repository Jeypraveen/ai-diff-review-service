import { describe, it, expect } from 'vitest';
import { mergeFindings } from '../../src/services/findings-merger.js';
import type { Finding } from '../../src/types/index.js';

function makeFinding(ruleId: string, path: string, line: number): Finding {
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    path,
    line,
    severity: 'medium',
    category: 'correctness',
    title: `test-${ruleId}`,
    evidence: 'test evidence',
  };
}

describe('Findings Merger', () => {
  it('should merge findings from multiple chunks', () => {
    const chunk1 = [makeFinding('MOCK-001', 'a.js', 5)];
    const chunk2 = [makeFinding('MOCK-007', 'b.js', 10)];
    const { findings, totalCount } = mergeFindings([chunk1, chunk2]);
    expect(findings).toHaveLength(2);
    expect(totalCount).toBe(2);
  });

  it('should deduplicate same path + line + ruleId', () => {
    const chunk1 = [makeFinding('MOCK-001', 'a.js', 5)];
    const chunk2 = [makeFinding('MOCK-001', 'a.js', 5)];
    const { findings, totalCount } = mergeFindings([chunk1, chunk2]);
    expect(findings).toHaveLength(1);
    expect(totalCount).toBe(1);
  });

  it('should NOT deduplicate different rules on same line', () => {
    const chunk1 = [
      makeFinding('MOCK-001', 'a.js', 5),
      makeFinding('MOCK-007', 'a.js', 5),
    ];
    const { findings } = mergeFindings([chunk1]);
    expect(findings).toHaveLength(2);
  });

  it('should apply maxFindings truncation', () => {
    const chunk1 = [
      makeFinding('MOCK-001', 'a.js', 1),
      makeFinding('MOCK-002', 'a.js', 2),
      makeFinding('MOCK-003', 'a.js', 3),
      makeFinding('MOCK-004', 'a.js', 4),
      makeFinding('MOCK-005', 'a.js', 5),
    ];
    const { findings, totalCount } = mergeFindings([chunk1], 3);
    expect(findings).toHaveLength(3);
    expect(totalCount).toBe(5);
  });

  it('should sort by path, then line, then ruleId', () => {
    const chunk1 = [
      makeFinding('MOCK-002', 'b.js', 5),
      makeFinding('MOCK-001', 'a.js', 10),
      makeFinding('MOCK-003', 'a.js', 5),
    ];
    const { findings } = mergeFindings([chunk1]);
    expect(findings[0].path).toBe('a.js');
    expect(findings[0].line).toBe(5);
    expect(findings[1].path).toBe('a.js');
    expect(findings[1].line).toBe(10);
    expect(findings[2].path).toBe('b.js');
  });

  it('should handle empty chunks', () => {
    const { findings, totalCount } = mergeFindings([[], []]);
    expect(findings).toHaveLength(0);
    expect(totalCount).toBe(0);
  });

  it('should handle maxFindings = 0', () => {
    const chunk1 = [makeFinding('MOCK-001', 'a.js', 1)];
    const { findings, totalCount } = mergeFindings([chunk1], 0);
    expect(findings).toHaveLength(0);
    expect(totalCount).toBe(1);
  });
});
