import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFileAtomic } from "../../src/utils/atomic-write.js";

describe("writeFileAtomic", () => {
  it("writes the final content at the target path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-atomic-"));
    try {
      const path = join(dir, "out.txt");
      await writeFileAtomic(path, "hello");
      expect(readFileSync(path, "utf8")).toBe("hello");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves no .tmp.* siblings on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-atomic-"));
    try {
      const path = join(dir, "out.txt");
      await writeFileAtomic(path, "x");
      const entries = readdirSync(dir);
      expect(entries.filter((e) => e.includes(".tmp."))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects when the target directory does not exist", async () => {
    let threw = false;
    try {
      await writeFileAtomic("/nonexistent-op/out.txt", "x");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
