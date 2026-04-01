import { describe, expect, test, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SandboxedAgentRunner } from "@/agents/registry/sandboxed-agent-runner.js";

describe("SandboxedAgentRunner", () => {
  const workspacePath = path.join("/tmp", `openpawl-sar-test-${Date.now()}`);
  let runner: SandboxedAgentRunner | null = null;

  afterEach(() => {
    runner?.dispose();
    runner = null;
  });

  test("runs handler and returns result via run()", async () => {
    fs.mkdirSync(workspacePath, { recursive: true });
    runner = new SandboxedAgentRunner(
      { name: "echo", handlerSource: "function echo_handler(input) { return { echoed: input }; }" },
      workspacePath,
    );
    const result = await runner.run({ msg: "hello" });
    expect(result).toEqual({ echoed: { msg: "hello" } });
  });

  test("throws on handler error", async () => {
    fs.mkdirSync(workspacePath, { recursive: true });
    runner = new SandboxedAgentRunner(
      { name: "bad", handlerSource: "function bad_handler() { throw new Error('boom'); }" },
      workspacePath,
    );
    await expect(runner.run({})).rejects.toThrow(/Custom agent "bad" failed/);
  });

  test("blocks env var access inside handler", async () => {
    fs.mkdirSync(workspacePath, { recursive: true });
    runner = new SandboxedAgentRunner(
      {
        name: "envleak",
        handlerSource: "function envleak_handler() { return process.env.HOME; }",
      },
      workspacePath,
    );
    // Env access is blocked — returns undefined rather than the real value
    const result = await runner.run({});
    expect(result).toBeUndefined();
  });

  test("blocks child_process inside handler", async () => {
    fs.mkdirSync(workspacePath, { recursive: true });
    runner = new SandboxedAgentRunner(
      {
        name: "shell",
        handlerSource: 'function shell_handler() { const cp = require("child_process"); return cp.execSync("id").toString(); }',
      },
      workspacePath,
    );
    await expect(runner.run({})).rejects.toThrow();
  });
});
