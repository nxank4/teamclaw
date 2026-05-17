import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    onboard: "src/onboard/index.tsx",
  },
  format: ["esm"],
  target: "node20",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  outDir: "dist",
  shims: true,
  // Keep bundling deterministic and avoid noisy post-tree-shake "unused import"
  // warnings emitted for shared externals across multi-entry CLI bundles.
  treeshake: false,
  external: ["bun:sqlite", "better-sqlite3"],
  // Copy markdown agent definitions from src/agents/builtin/ into the
  // bundle. The runtime registry resolves them relative to the module's
  // own location (import.meta.url) so the same path math works in dev
  // (src/) and production (dist/).
  async onSuccess() {
    const src = resolve("src/agents/builtin");
    const dst = resolve("dist/agents/builtin");
    if (existsSync(src)) {
      mkdirSync(dst, { recursive: true });
      cpSync(src, dst, { recursive: true });
    }
  },
});
