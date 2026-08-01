import type { ParsedFile, AddedLine } from '../types/index.js';

/**
 * Parse a unified diff string into structured per-file data.
 *
 * Handles:
 * - Multi-file diffs
 * - Correct new-file line numbers from @@ hunk headers
 * - Only `+` lines (excluding `+++` headers) are "added"
 * - Binary file markers, no-newline-at-EOF
 */
export function parseDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = diff.split('\n');

  let currentFile: ParsedFile | null = null;
  let currentNewLine = 0; // tracks position in the new file
  let rawDiffLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── New file header: diff --git a/path b/path ──
    if (line.startsWith('diff --git ') || line.startsWith('diff ')) {
      // Save previous file if exists
      if (currentFile) {
        currentFile.rawDiff = rawDiffLines.join('\n');
        files.push(currentFile);
      }

      currentFile = null;
      rawDiffLines = [line];
      currentNewLine = 0;
      continue;
    }

    rawDiffLines.push(line);

    // ── New file path: +++ b/path ──
    if (line.startsWith('+++ ')) {
      const filePath = extractFilePath(line);
      currentFile = {
        path: filePath,
        addedLines: [],
        rawDiff: '', // filled when we hit next file or EOF
      };
      continue;
    }

    // ── Old file path: --- a/path (skip, just collect) ──
    if (line.startsWith('--- ')) {
      continue;
    }

    // ── Hunk header: @@ -oldStart,oldCount +newStart,newCount @@ ──
    const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      currentNewLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!currentFile) continue;

    // ── Added line: + ──
    if (line.startsWith('+')) {
      const content = line.substring(1); // remove the leading +
      currentFile.addedLines.push({
        lineNumber: currentNewLine,
        content,
      });
      currentNewLine++;
      continue;
    }

    // ── Removed line: - (doesn't advance new-file counter) ──
    if (line.startsWith('-')) {
      continue;
    }

    // ── Context line (space or empty within hunk) — advances new-file counter ──
    if (line.startsWith(' ') || (line === '' && currentNewLine > 0)) {
      currentNewLine++;
      continue;
    }

    // ── No-newline marker or other metadata ──
    if (line.startsWith('\\')) {
      continue;
    }
  }

  // Save the last file
  if (currentFile) {
    currentFile.rawDiff = rawDiffLines.join('\n');
    files.push(currentFile);
  }

  return files;
}

/**
 * Extract file path from +++ line.
 * Handles: "+++ b/src/foo.ts", "+++ /dev/null"
 */
function extractFilePath(line: string): string {
  const pathPart = line.substring(4).trim(); // remove "+++ "

  // Handle "+++ b/path" (git diff format)
  if (pathPart.startsWith('b/')) {
    return pathPart.substring(2);
  }

  // Handle "+++ path" (plain diff)
  return pathPart;
}

/**
 * Reconstruct the raw diff text for a single file from the parsed files.
 * Used for byte-size calculation in chunking.
 */
export function getFileDiffSize(file: ParsedFile): number {
  return Buffer.byteLength(file.rawDiff, 'utf8');
}
