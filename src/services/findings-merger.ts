import type { Finding } from '../types/index.js';

/**
 * Merge findings from multiple chunks into a single ordered list.
 *
 * Per spec:
 * - Ordering: by path (lexicographic), then line (ascending), then ruleId
 * - Deduplicate by id (which is "ruleId:path:line")
 * - maxFindings truncates the ordered list; usage still reflects the full scan
 */
export function mergeFindings(
  chunkFindings: Finding[][],
  maxFindings?: number,
): { findings: Finding[]; totalCount: number } {
  // Flatten all findings
  const allFindings: Finding[] = [];
  for (const chunk of chunkFindings) {
    allFindings.push(...chunk);
  }

  // Deduplicate by id (format: "ruleId:path:line")
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const finding of allFindings) {
    const key = finding.id || `${finding.ruleId}:${finding.path}:${finding.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(finding);
    }
  }

  // Sort: by path (lexicographic), then line (ascending), then ruleId
  deduped.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.line !== b.line) return a.line - b.line;
    return a.ruleId.localeCompare(b.ruleId);
  });

  const totalCount = deduped.length;

  // maxFindings truncates the ordered list
  const truncated =
    maxFindings !== undefined && maxFindings >= 0
      ? deduped.slice(0, maxFindings)
      : deduped;

  return { findings: truncated, totalCount };
}
