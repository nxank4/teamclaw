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
  treeshake: true,
});
