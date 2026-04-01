/**
 * Token compression utilities.
 * Strips comments, debug statements, blank lines, and trailing whitespace.
 */

export interface CompressResult {
  original: string;
  compressed: string;
  originalLines: number;
  compressedLines: number;
  reductionPercent: number;
}

const SINGLE_LINE_COMMENT = /^\s*\/\/.*$/;
const MULTI_LINE_COMMENT_START = /^\s*\/\*\*?/;
const MULTI_LINE_COMMENT_END = /\*\/\s*$/;
const HASH_COMMENT = /^\s*#(?!!).*$/;
const HTML_COMMENT_FULL = /^\s*<!--.*-->\s*$/;
const DEBUG_PATTERNS = [
  /^\s*console\.(log|debug|info|warn|trace)\s*\(/,
  /^\s*print\s*\(/,
  /^\s*debugger\s*;?\s*$/,
  /^\s*logger\.(debug|trace|verbose)\s*\(/,
];
const BLANK_LINE = /^\s*$/;

export function compressCode(source: string, options?: {
  removeComments?: boolean;
  removeDebug?: boolean;
  removeBlankLines?: boolean;
  trimTrailing?: boolean;
}): CompressResult {
  const opts = {
    removeComments: true,
    removeDebug: true,
    removeBlankLines: true,
    trimTrailing: true,
    ...options,
  };

  const lines = source.split('\n');
  const originalLines = lines.length;
  const result: string[] = [];
  let inMultiLineComment = false;

  for (const line of lines) {
    // Multi-line comment tracking
    if (opts.removeComments) {
      if (inMultiLineComment) {
        if (MULTI_LINE_COMMENT_END.test(line)) {
          inMultiLineComment = false;
        }
        continue;
      }
      if (MULTI_LINE_COMMENT_START.test(line)) {
        if (MULTI_LINE_COMMENT_END.test(line)) {
          // Single-line block comment like /* ... */
          continue;
        }
        inMultiLineComment = true;
        continue;
      }
      if (SINGLE_LINE_COMMENT.test(line)) continue;
      if (HASH_COMMENT.test(line)) continue;
      if (HTML_COMMENT_FULL.test(line)) continue;
    }

    // Debug statement removal
    if (opts.removeDebug) {
      if (DEBUG_PATTERNS.some(p => p.test(line))) continue;
    }

    // Blank line removal
    if (opts.removeBlankLines && BLANK_LINE.test(line)) continue;

    // Trailing whitespace
    const processed = opts.trimTrailing ? line.trimEnd() : line;
    result.push(processed);
  }

  const compressed = result.join('\n');
  const compressedLines = result.length;
  const originalLen = source.length;
  const compressedLen = compressed.length;
  const reductionPercent = originalLen > 0
    ? Math.round((1 - compressedLen / originalLen) * 100)
    : 0;

  return {
    original: source,
    compressed,
    originalLines,
    compressedLines,
    reductionPercent,
  };
}

export function selectRelevantFiles(
  files: string[],
  query: string
): string[] {
  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return files;

  return files
    .map(file => {
      const lower = file.toLowerCase();
      const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
      return { file, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ file }) => file);
}
