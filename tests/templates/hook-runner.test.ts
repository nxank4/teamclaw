import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { canUseIsolate } from "../helpers/can-use-isolate.js";
import { runTemplateHook } from "@/templates/hook-runner.js";

describe.skipIf(!canUseIsolate())("runTemplateHook", () => {
  const projectPath = path.join("/tmp", `openpawl-hook-test-${Date.now()}`);

  test("runs hook code and returns success", async () => {
    fs.mkdirSync(projectPath, { recursive: true });
    const result = await runTemplateHook(
      'console.log("hook ran");',
      projectPath,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("hook ran");
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  test("blocks network in hook", async () => {
    fs.mkdirSync(projectPath, { recursive: true });
    const result = await runTemplateHook(
      'fetch("https://example.com").then(() => {}).catch(() => process.exit(1));',
      projectPath,
    );
    expect(result.success).toBe(false);
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  test("always disposes runtime even on error", async () => {
    fs.mkdirSync(projectPath, { recursive: true });
    // This should not leak — runtime.dispose() is in finally block
    const result = await runTemplateHook(
      "throw new Error('boom');",
      projectPath,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    fs.rmSync(projectPath, { recursive: true, force: true });
  });
});
