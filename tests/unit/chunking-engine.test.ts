import { describe, it, expect } from 'vitest';
import { chunkFiles } from '../../src/services/chunking-engine.js';
import type { ParsedFile } from '../../src/types/index.js';

function makeFile(path: string, sizeBytes: number): ParsedFile {
  // Create a rawDiff of approximately the target size
  const content = 'x'.repeat(Math.max(0, sizeBytes - 50));
  return {
    path,
    addedLines: [{ lineNumber: 1, content }],
    rawDiff: `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n+${content}`,
  };
}

describe('Chunking Engine', () => {
  it('should put small files in a single chunk', () => {
    const files = [
      makeFile('a.js', 1000),
      makeFile('b.js', 1000),
    ];
    const chunks = chunkFiles(files);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toHaveLength(2);
  });

  it('should split when total exceeds 64 KiB', () => {
    const files = [
      makeFile('a.js', 40000), // ~40 KB
      makeFile('b.js', 40000), // ~40 KB — total exceeds 64 KiB
    ];
    const chunks = chunkFiles(files);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].files).toHaveLength(1);
    expect(chunks[1].files).toHaveLength(1);
  });

  it('should give oversized file its own chunk', () => {
    const files = [
      makeFile('small.js', 1000),
      makeFile('huge.js', 70000), // > 64 KiB
      makeFile('another.js', 1000),
    ];
    const chunks = chunkFiles(files);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].files[0].path).toBe('small.js');
    expect(chunks[1].files[0].path).toBe('huge.js');
    expect(chunks[2].files[0].path).toBe('another.js');
  });

  it('should preserve file order across chunks', () => {
    const files = [
      makeFile('1.js', 30000),
      makeFile('2.js', 30000),
      makeFile('3.js', 30000),
      makeFile('4.js', 30000),
    ];
    const chunks = chunkFiles(files);
    const allPaths = chunks.flatMap((c) => c.files.map((f) => f.path));
    expect(allPaths).toEqual(['1.js', '2.js', '3.js', '4.js']);
  });

  it('should handle empty file list', () => {
    const chunks = chunkFiles([]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].files).toHaveLength(0);
  });

  it('should set correct chunk indices', () => {
    const files = [
      makeFile('a.js', 40000),
      makeFile('b.js', 40000),
      makeFile('c.js', 40000),
    ];
    const chunks = chunkFiles(files);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });
});
