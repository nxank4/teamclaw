/**
 * Tool output handler — summarizes large tool outputs and offloads
 * full content to scratch files. Prevents context bloat from
 * directory listings, file reads, and test results.
 */

import { writeFile, mkdir, readdir, stat, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ToolOutputConfig, SummarizedOutput } from "./types.js";

const DEFAULT_CONFIG: ToolOutputConfig = {
  inlineMaxChars: 4000,
  previewLines: 20,
  scratchDir: ".openpawl/scratch",
};

const MAX_SCRATCH_BYTES = 50 * 1024 * 1024; // 50MB

type ToolType = "file_read" | "shell_exec" | "directory" | "search" | "generic";

export class ToolOutputHandler {
  private config: ToolOutputConfig;
  private scratchDir: string;
  private scratchReady = false;

  constructor(workingDirectory: string, config?: Partial<ToolOutputConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scratchDir = join(workingDirectory, this.config.scratchDir);
  }

  /**
   * Process tool output: return as-is if small, or truncate + offload if large.
   */
  async processToolOutput(
    toolName: string,
    rawOutput: string,
  ): Promise<SummarizedOutput> {
    if (rawOutput.length <= this.config.inlineMaxChars) {
      return {
        content: rawOutput,
        originalSize: rawOutput.length,
        truncated: false,
      };
    }

    const scratchFile = await this.saveToScratch(toolName, rawOutput);
    const toolType = detectToolType(toolName);
    const preview = this.buildPreview(rawOutput, toolType);

    const content = [
      `[Tool output truncated — ${rawOutput.length} chars → ${preview.length} chars]`,
      `[Full output saved to: ${scratchFile}]`,
      "",
      preview,
    ].join("\n");

    return {
      content,
      scratchFile,
      originalSize: rawOutput.length,
      truncated: true,
    };
  }

  /**
   * Build a smart preview based on tool type.
   */
  private buildPreview(output: string, toolType: ToolType): string {
    const lines = output.split("\n");

    switch (toolType) {
      case "file_read":
        return this.previewFileRead(lines);
      case "shell_exec":
        return this.previewShellExec(lines);
      case "directory":
        return this.previewDirectory(lines);
      case "search":
        return this.previewSearch(lines);
      default:
        return this.previewGeneric(lines);
    }
  }

  /** First 15 lines + last 5 lines + line count. */
  private previewFileRead(lines: string[]): string {
    const parts: string[] = [];
    const head = lines.slice(0, 15);
    const tail = lines.slice(-5);

    parts.push(...head);
    if (lines.length > 20) {
      parts.push(`\n... (${lines.length} lines total) ...\n`);
    }
    parts.push(...tail);

    return parts.join("\n");
  }

  /** Last 20 lines (most recent output matters most). */
  private previewShellExec(lines: string[]): string {
    const tail = lines.slice(-20);
    const parts: string[] = [];

    if (lines.length > 20) {
      parts.push(`... (${lines.length - 20} lines above) ...`);
    }
    parts.push(...tail);

    return parts.join("\n");
  }

  /** Top-level entries + total count. */
  private previewDirectory(lines: string[]): string {
    // Count non-empty lines as entries
    const entries = lines.filter((l) => l.trim().length > 0);
    const shown = entries.slice(0, 30);
    const parts = [...shown];

    if (entries.length > 30) {
      parts.push(`... and ${entries.length - 30} more entries — ${entries.length} total`);
    }

    return parts.join("\n");
  }

  /** First 15 matches + total match count. */
  private previewSearch(lines: string[]): string {
    const matches = lines.filter((l) => l.trim().length > 0);
    const shown = matches.slice(0, 15);
    const parts = [...shown];

    if (matches.length > 15) {
      parts.push(`... ${matches.length - 15} more matches — ${matches.length} total`);
    }

    return parts.join("\n");
  }

  /** First 15 + last 5 lines (generic fallback). */
  private previewGeneric(lines: string[]): string {
    const head = lines.slice(0, 15);
    const tail = lines.slice(-5);
    const parts: string[] = [];

    parts.push(...head);
    if (lines.length > 20) {
      parts.push(`\n... (${lines.length - 20} lines omitted) ...\n`);
    }
    parts.push(...tail);

    return parts.join("\n");
  }

  /**
   * Save full output to a scratch file. Returns the file path.
   */
  private async saveToScratch(toolName: string, output: string): Promise<string> {
    if (!this.scratchReady) {
      await mkdir(this.scratchDir, { recursive: true });
      this.scratchReady = true;
    }

    await this.enforceSizeLimit();

    const safeName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeName}-${Date.now()}.txt`;
    const filepath = join(this.scratchDir, filename);

    await writeFile(filepath, output, "utf-8");
    return filepath;
  }

  /**
   * Enforce max scratch directory size. Deletes oldest files if over limit.
   */
  private async enforceSizeLimit(): Promise<void> {
    try {
      const entries = await readdir(this.scratchDir);
      if (entries.length === 0) return;

      const fileStats = await Promise.all(
        entries.map(async (name) => {
          const filepath = join(this.scratchDir, name);
          const s = await stat(filepath);
          return { filepath, size: s.size, mtimeMs: s.mtimeMs };
        }),
      );

      const totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);
      if (totalSize <= MAX_SCRATCH_BYTES) return;

      // Sort by oldest first, delete until under limit
      fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
      let freed = 0;
      const target = totalSize - MAX_SCRATCH_BYTES;

      for (const file of fileStats) {
        if (freed >= target) break;
        await unlink(file.filepath);
        freed += file.size;
      }
    } catch {
      // Scratch dir doesn't exist yet or other FS issue — ignore
    }
  }

  /**
   * Clean up the entire scratch directory.
   */
  async cleanup(): Promise<void> {
    try {
      await rm(this.scratchDir, { recursive: true, force: true });
      this.scratchReady = false;
    } catch {
      // Already gone or permission issue — ignore
    }
  }
}

/**
 * Detect the tool type from its name for smart preview selection.
 */
function detectToolType(toolName: string): ToolType {
  const name = toolName.toLowerCase();

  if (name.includes("file_read") || name.includes("read_file") || name === "cat") {
    return "file_read";
  }
  if (name.includes("shell") || name.includes("bash") || name.includes("exec") || name.includes("run_command")) {
    return "shell_exec";
  }
  if (name.includes("file_list") || name.includes("list_dir") || name.includes("directory") || name === "ls") {
    return "directory";
  }
  if (name.includes("grep") || name.includes("search") || name.includes("find") || name.includes("ripgrep")) {
    return "search";
  }
  return "generic";
}
