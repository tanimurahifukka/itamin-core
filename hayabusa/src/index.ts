#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { compressCode, selectRelevantFiles } from "./compressor.js";

const server = new McpServer({
  name: "hayabusa",
  version: "0.1.0",
});

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go",
  ".rs", ".java", ".sql", ".css", ".html", ".vue", ".svelte",
  ".json", ".yaml", ".yml", ".toml", ".md",
]);

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  ".cache", "coverage", "__pycache__", ".turbo",
]);

const IGNORE_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);

async function walkDir(dir: string, maxDepth = 5, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...await walkDir(fullPath, maxDepth, depth + 1));
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      if (CODE_EXTENSIONS.has(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Tool: compress_context
server.tool(
  "compress_context",
  "Read files from a directory, optionally filter by query, compress by removing comments/debug/blanks, and return compressed content with token savings report.",
  {
    directory: z.string().describe("Absolute path to the project directory"),
    query: z.string().optional().describe("Keywords to filter relevant files (space-separated)"),
    max_files: z.number().optional().default(20).describe("Maximum number of files to include"),
    remove_comments: z.boolean().optional().default(true),
    remove_debug: z.boolean().optional().default(true),
    remove_blank_lines: z.boolean().optional().default(true),
  },
  async ({ directory, query, max_files, remove_comments, remove_debug, remove_blank_lines }) => {
    try {
      const dirStat = await stat(directory);
      if (!dirStat.isDirectory()) {
        return { content: [{ type: "text" as const, text: `Error: ${directory} is not a directory` }] };
      }

      let files = await walkDir(directory);
      files = files.map(f => relative(directory, f));

      if (query) {
        files = selectRelevantFiles(files, query);
      }

      files = files.slice(0, max_files);

      let totalOriginalChars = 0;
      let totalCompressedChars = 0;
      let totalOriginalLines = 0;
      let totalCompressedLines = 0;
      const outputs: string[] = [];

      for (const file of files) {
        const fullPath = join(directory, file);
        const content = await readFile(fullPath, "utf-8");
        const result = compressCode(content, {
          removeComments: remove_comments,
          removeDebug: remove_debug,
          removeBlankLines: remove_blank_lines,
        });

        totalOriginalChars += result.original.length;
        totalCompressedChars += result.compressed.length;
        totalOriginalLines += result.originalLines;
        totalCompressedLines += result.compressedLines;

        outputs.push(`--- ${file} (${result.originalLines}→${result.compressedLines} lines, -${result.reductionPercent}%) ---\n${result.compressed}`);
      }

      const overallReduction = totalOriginalChars > 0
        ? Math.round((1 - totalCompressedChars / totalOriginalChars) * 100)
        : 0;

      const report = [
        `=== HAYABUSA Compression Report ===`,
        `Files: ${files.length}`,
        `Lines: ${totalOriginalLines} → ${totalCompressedLines} (-${totalOriginalLines - totalCompressedLines})`,
        `Chars: ${totalOriginalChars} → ${totalCompressedChars} (-${overallReduction}%)`,
        `===================================\n`,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: report + outputs.join("\n\n") }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
    }
  }
);

// Tool: compress_file
server.tool(
  "compress_file",
  "Compress a single file by removing comments, debug statements, and blank lines.",
  {
    file_path: z.string().describe("Absolute path to the file"),
    remove_comments: z.boolean().optional().default(true),
    remove_debug: z.boolean().optional().default(true),
    remove_blank_lines: z.boolean().optional().default(true),
  },
  async ({ file_path, remove_comments, remove_debug, remove_blank_lines }) => {
    try {
      const content = await readFile(file_path, "utf-8");
      const result = compressCode(content, {
        removeComments: remove_comments,
        removeDebug: remove_debug,
        removeBlankLines: remove_blank_lines,
      });

      const report = `[HAYABUSA] ${result.originalLines}→${result.compressedLines} lines, -${result.reductionPercent}%\n`;
      return {
        content: [{ type: "text" as const, text: report + result.compressed }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
    }
  }
);

// Tool: list_files
server.tool(
  "list_files",
  "List code files in a directory, optionally filtered by keyword query. Returns only relevant file paths.",
  {
    directory: z.string().describe("Absolute path to the project directory"),
    query: z.string().optional().describe("Keywords to filter files"),
    max_depth: z.number().optional().default(5),
  },
  async ({ directory, query, max_depth }) => {
    try {
      let files = await walkDir(directory, max_depth);
      files = files.map(f => relative(directory, f));
      if (query) {
        files = selectRelevantFiles(files, query);
      }
      return {
        content: [{ type: "text" as const, text: `${files.length} files found:\n${files.join("\n")}` }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[HAYABUSA] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[HAYABUSA] Fatal:", err);
  process.exit(1);
});
