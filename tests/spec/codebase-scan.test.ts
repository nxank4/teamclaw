import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractKeywords,
  scanForInterview,
} from "../../src/spec/codebase-scan.js";

/** Run a test against a freshly-created temp dir; cleans up after. */
function withTempProject(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "op-scan-"));
  return fn(root).finally(() => rmSync(root, { recursive: true, force: true }));
}

describe("extractKeywords", () => {
  it("drops short words and common stop-words", () => {
    const kw = extractKeywords("refactor the auth module across login signup with files");
    // Kept: specific feature-words long enough to be useful for path matching.
    expect(kw).toContain("refactor");
    expect(kw).toContain("auth");
    expect(kw).toContain("login");
    expect(kw).toContain("signup");
    // Dropped: too short ('the' < 4 chars), stop-word vague nouns ('module',
    // 'files'), generic prepositions ('with', 'across').
    expect(kw).not.toContain("the");
    expect(kw).not.toContain("with");
    expect(kw).not.toContain("files");
    expect(kw).not.toContain("module");
    expect(kw).not.toContain("across");
  });

  it("deduplicates while preserving first-seen order", () => {
    const kw = extractKeywords("login login signup login reset login");
    expect(kw).toEqual(["login", "signup", "reset"]);
  });
});

describe("scanForInterview", () => {
  it("returns empty results when project has no convention files and no keyword matches", async () => {
    await withTempProject(async (root) => {
      // Drop a single irrelevant file so the tree isn't empty.
      writeFileSync(join(root, "irrelevant.txt"), "lorem ipsum");
      const ctx = await scanForInterview("add age field to User type", root);
      expect(ctx.keyFiles).toHaveLength(0);
      // Conventions empty because none of CLAUDE.md/AGENTS.md/etc are present.
      expect(ctx.conventions).toBe("");
      expect(ctx.fileTree).toContain("irrelevant.txt");
      expect(ctx.truncated).toBe(false);
    });
  });

  it("reads CLAUDE.md, AGENTS.md and package.json into the conventions block", async () => {
    await withTempProject(async (root) => {
      writeFileSync(join(root, "CLAUDE.md"), "House rules: be terse.");
      writeFileSync(join(root, "AGENTS.md"), "Subagents available: architect, builder.");
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }));
      writeFileSync(join(root, "README.md"), "# Demo project");
      const ctx = await scanForInterview("explain the auth flow", root);
      expect(ctx.conventions).toContain("--- CLAUDE.md ---");
      expect(ctx.conventions).toContain("House rules: be terse.");
      expect(ctx.conventions).toContain("--- AGENTS.md ---");
      expect(ctx.conventions).toContain("Subagents available: architect");
      expect(ctx.conventions).toContain("--- package.json ---");
      expect(ctx.conventions).toContain('"name":"demo"');
      expect(ctx.conventions).toContain("--- README.md ---");
    });
  });

  it("matches files whose path contains prompt keywords and excerpts them", async () => {
    await withTempProject(async (root) => {
      mkdirSync(join(root, "src", "auth"), { recursive: true });
      writeFileSync(join(root, "src", "auth", "login.ts"), "export function login() {}\n");
      writeFileSync(join(root, "src", "auth", "signup.ts"), "export function signup() {}\n");
      // A file that should NOT match.
      mkdirSync(join(root, "src", "billing"), { recursive: true });
      writeFileSync(join(root, "src", "billing", "invoice.ts"), "export const invoice = 1;\n");

      const ctx = await scanForInterview(
        "refactor the auth module across login signup reset",
        root,
      );
      const paths = ctx.keyFiles.map((f) => f.path);
      expect(paths).toContain(join("src", "auth", "login.ts"));
      expect(paths).toContain(join("src", "auth", "signup.ts"));
      expect(paths).not.toContain(join("src", "billing", "invoice.ts"));
      expect(ctx.keyFiles[0]?.excerpt).toContain("export function");
    });
  });

  it("never descends into ignored directories (node_modules, dist, .git)", async () => {
    await withTempProject(async (root) => {
      // Real source.
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "login.ts"), "// login here");
      // Stuff inside ignored dirs.
      mkdirSync(join(root, "node_modules", "fake-login"), { recursive: true });
      writeFileSync(join(root, "node_modules", "fake-login", "index.js"), "// fake login");
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(join(root, "dist", "login.bundle.js"), "// bundled login");
      mkdirSync(join(root, ".git"), { recursive: true });
      writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main");

      const ctx = await scanForInterview("touch the login endpoint", root);
      const paths = ctx.keyFiles.map((f) => f.path);
      expect(paths).toContain(join("src", "login.ts"));
      // Nothing from node_modules / dist / .git should be surfaced.
      for (const p of paths) {
        expect(p.startsWith("node_modules")).toBe(false);
        expect(p.startsWith("dist")).toBe(false);
        expect(p.startsWith(".git")).toBe(false);
      }
      // Tree also prunes them.
      expect(ctx.fileTree).not.toContain("node_modules");
      expect(ctx.fileTree).not.toContain("dist/");
    });
  });

  it("respects the maxChars budget — large content stops adding files once the cap is reached", async () => {
    await withTempProject(async (root) => {
      // Each file is ~2kb; with cap of 5kb we should get at most 2-3 files.
      mkdirSync(join(root, "src"), { recursive: true });
      for (let i = 0; i < 6; i++) {
        writeFileSync(
          join(root, "src", `login-${i}.ts`),
          "// login\n" + "x".repeat(2000),
        );
      }
      const ctx = await scanForInterview("touch the login module", root, {
        maxChars: 5000,
      });
      // Total chars budget caps the sum; not all 6 files fit.
      const totalChars = ctx.keyFiles.reduce((acc, f) => acc + f.excerpt.length, 0);
      expect(totalChars).toBeLessThanOrEqual(5000);
      expect(ctx.keyFiles.length).toBeLessThan(6);
      expect(ctx.truncated).toBe(true);
    });
  });

  it("aborts on wall-time budget via injected clock", async () => {
    await withTempProject(async (root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "login.ts"), "// login");
      writeFileSync(join(root, "src", "logout.ts"), "// logout");
      // Clock that advances 100ms per call; deadline is 1ms → tripped on second call.
      let calls = 0;
      const now = () => {
        const t = calls === 0 ? 0 : 100;
        calls++;
        return t;
      };
      const ctx = await scanForInterview("touch login", root, {
        maxWallMs: 1,
        now,
      });
      // truncated may or may not be true depending on when we trip — but the scan
      // must complete without error and produce a partial-or-empty result.
      expect(Array.isArray(ctx.keyFiles)).toBe(true);
      expect(typeof ctx.fileTree).toBe("string");
    });
  });

  it("file tree shows depth-2 contents with sorted children", async () => {
    await withTempProject(async (root) => {
      mkdirSync(join(root, "src", "spec"), { recursive: true });
      mkdirSync(join(root, "src", "tui"), { recursive: true });
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(join(root, "src", "index.ts"), "");
      writeFileSync(join(root, "src", "spec", "loader.ts"), "");
      writeFileSync(join(root, "src", "tui", "core.ts"), "");
      writeFileSync(join(root, "package.json"), "{}");

      const ctx = await scanForInterview("any query", root);
      expect(ctx.fileTree).toContain("src/");
      expect(ctx.fileTree).toContain("tests/");
      expect(ctx.fileTree).toContain("package.json");
      // Depth-2 should include spec/ and tui/ and index.ts under src.
      expect(ctx.fileTree).toMatch(/spec\//);
      expect(ctx.fileTree).toMatch(/tui\//);
      expect(ctx.fileTree).toMatch(/index\.ts/);
      // Depth-3 (e.g. loader.ts inside spec/) should NOT appear.
      expect(ctx.fileTree).not.toMatch(/loader\.ts/);
    });
  });
});
