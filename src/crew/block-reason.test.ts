import { describe, expect, it } from "bun:test";

import { blockReason, markTaskBlocked } from "./block-reason.js";
import type { ToolForbidden } from "./capability-gate.js";
import { CrewTaskSchema, type CrewTask } from "./types.js";
import { WriteLockTimeoutError } from "./write-lock.js";

function makeTask(id = "t1"): CrewTask {
  return CrewTaskSchema.parse({
    id,
    phase_id: "p1",
    description: "Stub task for block-reason tests",
    assigned_agent: "coder",
  });
}

describe("markTaskBlocked", () => {
  it("sets status=blocked and assigns the reason in one step", () => {
    const t = makeTask();
    markTaskBlocked(t, blockReason.unknown("test"));
    expect(t.status).toBe("blocked");
    expect(t.blocked_reason?.code).toBe("unknown");
    expect(t.blocked_reason?.message).toContain("test");
  });

  it("overwrites a prior reason (last-writer-wins per task)", () => {
    const t = makeTask();
    markTaskBlocked(t, blockReason.timeout(10));
    markTaskBlocked(t, blockReason.userAbort("phase"));
    expect(t.blocked_reason?.code).toBe("user_abort");
    expect(t.blocked_reason?.details?.where).toBe("phase");
  });
});

describe("blockReason builders", () => {
  it("budgetTask carries scope=task + used + cap", () => {
    const r = blockReason.budgetTask(60_000, 50_000);
    expect(r.code).toBe("budget_task_exceeded");
    expect(r.message).toContain("60000");
    expect(r.message).toContain("50000");
    expect(r.message).toContain("max_tokens_per_task");
    expect(r.details).toEqual({ used: 60_000, cap: 50_000, scope: "task" });
  });

  it("budgetPhase carries scope=phase + used + requested + cap", () => {
    const r = blockReason.budgetPhase(100, 20, 110);
    expect(r.code).toBe("budget_phase_exceeded");
    expect(r.details?.scope).toBe("phase");
    expect(r.details?.cap).toBe(110);
    expect(r.message).toContain("max_tokens_per_phase");
  });

  it("budgetSession carries scope=session + used + cap", () => {
    const r = blockReason.budgetSession(1000, 500);
    expect(r.code).toBe("budget_session_exceeded");
    expect(r.details?.scope).toBe("session");
    expect(r.message).toContain("max_tokens_per_session");
  });

  it("depFailed embeds upstream when provided", () => {
    const upstream = blockReason.timeout(30);
    const r = blockReason.depFailed("t1", upstream);
    expect(r.code).toBe("dep_failed");
    expect(r.message).toContain("'t1'");
    expect(r.message).toContain("wall-clock");
    expect(r.details?.dep_task_id).toBe("t1");
    expect(r.details?.upstream_reason).toEqual(upstream);
  });

  it("depFailed works without upstream (defensive default)", () => {
    const r = blockReason.depFailed("t1");
    expect(r.code).toBe("dep_failed");
    expect(r.message).toContain("'t1'");
  });

  it("capabilityDenied surfaces tool name for allowlist denials", () => {
    const denial: ToolForbidden = {
      agent_id: "coder",
      tool: "shell_exec",
      reason: "tool_not_in_allowlist",
      message: "denied",
    };
    const r = blockReason.capabilityDenied(denial);
    expect(r.code).toBe("capability_denied");
    expect(r.message).toContain("'shell_exec'");
    expect(r.details?.kind).toBe("tool_not_in_allowlist");
  });

  it("capabilityDenied surfaces path for write-scope denials", () => {
    const denial: ToolForbidden = {
      agent_id: "coder",
      tool: "file_write",
      reason: "write_outside_scope",
      message: "denied",
      attempted_path: "src/secret.ts",
      scope: ["src/**/*.test.ts"],
    };
    const r = blockReason.capabilityDenied(denial);
    expect(r.message).toContain("'src/secret.ts'");
    expect(r.details?.scope).toEqual(["src/**/*.test.ts"]);
  });

  it("writeLockTimeout carries holder + timeout", () => {
    const err = new WriteLockTimeoutError("src/a.ts", "coder", 30_000, "tester");
    const r = blockReason.writeLockTimeout(err);
    expect(r.code).toBe("write_lock_timeout");
    expect(r.message).toContain("'tester'");
    expect(r.message).toContain("30000ms");
    expect(r.details).toMatchObject({
      path: "src/a.ts",
      holder: "tester",
      timeout_ms: 30_000,
    });
  });

  it("envError nests the TaskErrorKind in details", () => {
    const r = blockReason.envError("env_command_not_found", { exit_code: 127 });
    expect(r.code).toBe("env_error");
    expect(r.message).toContain("env_command_not_found");
    expect(r.message).toContain("exit 127");
    expect(r.details?.kind).toBe("env_command_not_found");
  });

  it("agentLogicMaxRetries carries retry count + last error", () => {
    const r = blockReason.agentLogicMaxRetries(3, "syntax error");
    expect(r.code).toBe("agent_logic_max_retries");
    expect(r.message).toContain("3 times");
    expect(r.message).toContain("syntax error");
  });

  it("timeout carries the wall-clock seconds", () => {
    const r = blockReason.timeout(120);
    expect(r.code).toBe("timeout");
    expect(r.message).toContain("120s");
    expect(r.details?.seconds).toBe(120);
  });

  it("userAbort and abortSignal carry the where field", () => {
    expect(blockReason.userAbort("phase_gate").code).toBe("user_abort");
    expect(blockReason.userAbort("phase_gate").details?.where).toBe("phase_gate");
    expect(blockReason.abortSignal("run").code).toBe("abort_signal");
  });

  it("validatorFailed includes the validator's message", () => {
    const r = blockReason.validatorFailed("missing file src/x.ts", {
      claimed_writes: ["src/x.ts"],
    });
    expect(r.code).toBe("validator_failed");
    expect(r.message).toContain("missing file");
    expect(r.details?.claimed_writes).toEqual(["src/x.ts"]);
  });
});
