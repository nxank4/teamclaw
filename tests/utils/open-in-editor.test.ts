import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openInEditor } from "../../src/utils/open-in-editor.js";

describe("openInEditor", () => {
  it("returns exit code 0 and matching mtimes when the editor is a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-editor-"));
    try {
      const path = join(dir, "spec.md");
      writeFileSync(path, "before");
      const result = await openInEditor({ path, editor: "true" });
      expect(result.exitCode).toBe(0);
      expect(result.mtimeAfter).toBe(result.mtimeBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects a write via mtime difference when the editor touches the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-editor-"));
    try {
      const path = join(dir, "spec.md");
      writeFileSync(path, "before");
      // touch updates mtime on its first positional arg — emulates a save.
      // Sleep a hair so mtime resolution doesn't collapse before == after.
      await new Promise((r) => setTimeout(r, 10));
      const result = await openInEditor({ path, editor: "touch" });
      expect(result.exitCode).toBe(0);
      expect(result.mtimeAfter).toBeGreaterThan(result.mtimeBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("propagates the editor's non-zero exit code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-editor-"));
    try {
      const path = join(dir, "spec.md");
      writeFileSync(path, "x");
      const result = await openInEditor({ path, editor: "false" });
      expect(result.exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects with the spawn error when the editor binary is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "op-editor-"));
    try {
      const path = join(dir, "spec.md");
      writeFileSync(path, "x");
      let caught: unknown;
      try {
        await openInEditor({ path, editor: "/this-binary-does-not-exist-op" });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(Error);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to VISUAL → EDITOR → vi when no override is supplied", async () => {
    // We can't invoke the editor reliably without a TTY, but we can
    // assert the resolution order by checking the env-derived spawn
    // throws when neither var is set and "vi" is unavailable — this
    // path is exercised indirectly. For a deterministic check we set
    // VISUAL to a known no-op.
    const dir = mkdtempSync(join(tmpdir(), "op-editor-"));
    try {
      const path = join(dir, "spec.md");
      writeFileSync(path, "x");
      const result = await openInEditor({
        path,
        env: { VISUAL: "true", EDITOR: "false" },
      });
      expect(result.exitCode).toBe(0); // VISUAL ("true") wins over EDITOR ("false")
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
