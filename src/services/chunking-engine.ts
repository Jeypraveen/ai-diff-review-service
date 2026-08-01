import type { ParsedFile, Chunk } from '../types/index.js';
import { getFileDiffSize } from './diff-parser.js';

const MAX_CHUNK_SIZE = 64 * 1024; // 64 KiB

/**
 * Split parsed files into chunks of at most 64 KiB each.
 *
 * Rules (per spec):
 * - Split only on file boundaries — one file's diff never spans two chunks
 * - A single file over 64 KiB is its own chunk
 * - Findings must be identical to an unchunked scan (no dupes, no losses, order preserved)
 */
export function chunkFiles(files: ParsedFile[]): Chunk[] {
  if (files.length === 0) {
    return [{ index: 0, files: [] }];
  }

  const chunks: Chunk[] = [];
  let currentChunkFiles: ParsedFile[] = [];
  let currentChunkSize = 0;

  for (const file of files) {
    const fileSize = getFileDiffSize(file);

    // If the file alone exceeds the max chunk size, it gets its own chunk
    if (fileSize > MAX_CHUNK_SIZE) {
      // First, flush any accumulated files into a chunk
      if (currentChunkFiles.length > 0) {
        chunks.push({ index: chunks.length, files: currentChunkFiles });
        currentChunkFiles = [];
        currentChunkSize = 0;
      }
      // Add the oversized file as its own chunk
      chunks.push({ index: chunks.length, files: [file] });
      continue;
    }

    // If adding this file would exceed the limit, start a new chunk
    if (currentChunkSize + fileSize > MAX_CHUNK_SIZE && currentChunkFiles.length > 0) {
      chunks.push({ index: chunks.length, files: currentChunkFiles });
      currentChunkFiles = [];
      currentChunkSize = 0;
    }

    currentChunkFiles.push(file);
    currentChunkSize += fileSize;
  }

  // Don't forget the last chunk
  if (currentChunkFiles.length > 0) {
    chunks.push({ index: chunks.length, files: currentChunkFiles });
  }

  return chunks;
}

/**
 * Calculate the total byte size of a raw diff string.
 */
export function getDiffByteSize(diff: string): number {
  return Buffer.byteLength(diff, 'utf8');
}
