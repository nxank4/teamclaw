import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ToolOutputHandler } from "../../src/context/tool-output-handler.js";

const TEST_DIR = join(tmpdir(), `openpawl-test-${Date.now()}`);
const SCRATCH_DIR = join(TEST_DIR, ".openpawl", "scratch");

describe("ToolOutputHandler", () => {
  let handler: ToolOutputHandler;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    handler = new ToolOutputHandler(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("small output", () => {
    it("returns as-is when under threshold", async () => {
      const output = "hello world";
      const result = await handler.processToolOutput("file_read", output);

      expect(result.content).toBe("hello world");
      expect(result.truncated).toBe(false);
      expect(result.scratchFile).toBeUndefined();
      expect(result.originalSize).toBe(11);
    });

    it("returns as-is at exactly the threshold", async () => {
      const output = "x".repeat(4000);
      const result = await handler.processToolOutput("file_read", output);

      expect(result.truncated).toBe(false);
      expect(result.content).toBe(output);
    });
  });

  describe("large output", () => {
    it("truncates and creates scratch file when over threshold", async () => {
      const output = Array.from({ length: 100 }, (_, i) => `line ${i + 1}: ${"x".repeat(50)}`).join("\n");
      const result = await handler.processToolOutput("file_read", output);

      expect(result.truncated).toBe(true);
      expect(result.originalSize).toBe(output.length);
      expect(result.scratchFile).toBeDefined();
      expect(result.content).toContain("[Tool output truncated");
      expect(result.content).toContain("[Full output saved to:");
    });

    it("scratch file contains full original output", async () => {
      const output = "y".repeat(5000);
      const result = await handler.processToolOutput("generic_tool", output);

      expect(result.scratchFile).toBeDefined();
      const saved = await readFile(result.scratchFile!, "utf-8");
      expect(saved).toBe(output);
    });
  });

  describe("file_read preview", () => {
    it("shows first 15 + last 5 lines with line count", async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line-${i + 1}: ${"content".repeat(10)}`);
      const output = lines.join("\n");
      const result = await handler.processToolOutput("file_read", output);

      expect(result.truncated).toBe(true);
      // Should contain first lines
      expect(result.content).toContain("line-1");
      expect(result.content).toContain("line-15");
      // Should contain last lines
      expect(result.content).toContain("line-100");
      // Should indicate total
      expect(result.content).toContain("100 lines total");
    });
  });

  describe("shell_exec preview", () => {
    it("shows last 20 lines", async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `output-${i + 1}: ${"data".repeat(15)}`);
      const output = lines.join("\n");
      const result = await handler.processToolOutput("shell_exec", output);

      expect(result.truncated).toBe(true);
      // Should contain last lines
      expect(result.content).toContain("output-100");
      expect(result.content).toContain("output-81");
      // Should indicate lines above
      expect(result.content).toContain("lines above");
    });
  });

  describe("directory listing preview", () => {
    it("shows top entries + total count", async () => {
      const entries = Array.from({ length: 50 }, (_, i) => `entry-${i + 1}/${"subdir/".repeat(15)}`);
      const output = entries.join("\n");
      const result = await handler.processToolOutput("file_list", output);

      expect(result.truncated).toBe(true);
      expect(result.content).toContain("entry-1/");
      expect(result.content).toContain("entry-30/");
      expect(result.content).toContain("50 total");
    });
  });

  describe("search preview", () => {
    it("shows first 15 matches + total count", async () => {
      const matches = Array.from({ length: 30 }, (_, i) => `src/file${i}.ts:10: match ${i} ${"context".repeat(25)}`);
      const output = matches.join("\n");
      const result = await handler.processToolOutput("grep", output);

      expect(result.truncated).toBe(true);
      expect(result.content).toContain("file0.ts");
      expect(result.content).toContain("30 total");
    });
  });

  describe("cleanup", () => {
    it("deletes scratch directory", async () => {
      // Create a scratch file first
      const output = "x".repeat(5000);
      await handler.processToolOutput("tool", output);

      await handler.cleanup();

      // Verify scratch dir is gone
      const { access } = await import("node:fs/promises");
      await expect(access(SCRATCH_DIR)).rejects.toThrow();
    });
  });

  describe("custom config", () => {
    it("respects custom inlineMaxChars", async () => {
      const customHandler = new ToolOutputHandler(TEST_DIR, { inlineMaxChars: 100 });
      const output = "x".repeat(200);
      const result = await customHandler.processToolOutput("tool", output);

      expect(result.truncated).toBe(true);
    });
  });
});
