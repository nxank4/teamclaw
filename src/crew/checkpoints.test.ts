import { describe, expect, it } from "bun:test";

import { CheckpointCoordinator, validateReorder } from "./checkpoints.js";
import { CrewPhaseSchema } from "./types.js";
import type { ReanchorPrompt } from "./drift-reanchor.js";

function phase(id: string, taskIds: string[] = ["t1"]): ReturnType<typeof CrewPhaseSchema.parse> {
  return CrewPhaseSchema.parse({
    id,
    name: `Phase ${id}`,
    description: "test phase",
    complexity_tier: "2",
    tasks: taskIds.map((tid, idx) => ({
      id: tid,
      phase_id: id,
      description: `Task ${tid}`,
      assigned_agent: "coder",
      depends_on: idx === 0 ? [] : [taskIds[idx - 1]!],
    })),
  });
}

const reanchor: ReanchorPrompt = {
  markdown: "# Drift halt\n\nGoal: example.",
  options: ["continue", "abort", "edit_goal"] as const,
};

describe("CheckpointCoordinator — Layer 2 phase advance", () => {
  it("auto-advances after the timer expires", async () => {
    const c = CheckpointCoordinator.tui({ auto_advance_timer_ms: 25 });
    const events: string[] = [];
    c.on("checkpoint:auto_advance", () => events.push("auto_advance"));

    const action = await c.waitForPhaseAdvance({
      phase: phase("p1"),
      summary_artifact_id: "a1",
    });

    expect(action).toBe("continue");
    expect(events).toContain("auto_advance");
  });

  it("strict mode blocks until /continue resolves the gate", async () => {
    const c = CheckpointCoordinator.tui({ strict_mode: true });
    const events: string[] = [];
    c.on("checkpoint:phase_pause", () => events.push("phase_pause"));
    c.on("checkpoint:phase_resumed", () => events.push("phase_resumed"));

    const pending = c.waitForPhaseAdvance({
      phase: phase("p2"),
      summary_artifact_id: "a2",
    });

    // Give the microtask queue a tick to register the gate.
    await new Promise((r) => setTimeout(r, 5));
    expect(c.getStatus().awaiting_phase_gate).toBe(true);

    const ok = c.resolvePhaseAdvance("continue");
    expect(ok).toBe(true);
    expect(await pending).toBe("continue");
    expect(events).toEqual(["phase_pause", "phase_resumed"]);
  });

  it("abort during gate resolves with abort", async () => {
    const c = CheckpointCoordinator.tui({ strict_mode: true });
    const pending = c.waitForPhaseAdvance({
      phase: phase("p1"),
      summary_artifact_id: "a1",
    });
    await new Promise((r) => setTimeout(r, 5));
    c.requestAbort();
    expect(await pending).toBe("abort");
  });

  it("adjust resolves the gate with adjust", async () => {
    const c = CheckpointCoordinator.tui({ strict_mode: true });
    const pending = c.waitForPhaseAdvance({
      phase: phase("p1"),
      summary_artifact_id: "a1",
    });
    await new Promise((r) => setTimeout(r, 5));
    c.resolvePhaseAdvance("adjust");
    expect(await pending).toBe("adjust");
  });

  it("returns abort immediately if abort already requested", async () => {
    const c = CheckpointCoordinator.tui({ strict_mode: true });
    c.requestAbort();
    const action = await c.waitForPhaseAdvance({
      phase: phase("p1"),
      summary_artifact_id: "a1",
    });
    expect(action).toBe("abort");
  });
});

describe("CheckpointCoordinator — headless mode", () => {
  it("waitForPhaseAdvance returns 'continue' immediately ignoring strict_mode", async () => {
    const c = CheckpointCoordinator.headless({ strict_mode: true, auto_advance_timer_ms: 99_999 });
    const events: string[] = [];
    c.on("checkpoint:auto_advance", (e: { reason: string }) => events.push(e.reason));

    const start = Date.now();
    const action = await c.waitForPhaseAdvance({
      phase: phase("p1"),
      summary_artifact_id: "a1",
    });
    const elapsed = Date.now() - start;
    expect(action).toBe("continue");
    expect(elapsed).toBeLessThan(50);
    expect(events).toContain("headless_no_user");
  });

  it("waitForReanchor resolves to abort + emits headless_reanchor event", async () => {
    const c = CheckpointCoordinator.headless();
    const events: ReanchorPrompt[] = [];
    c.on("checkpoint:headless_reanchor", (e: { reanchor: ReanchorPrompt }) =>
      events.push(e.reanchor),
    );

    const result = await c.waitForReanchor({ reanchor });
    expect(result.option).toBe("abort");
    expect(events.length).toBe(1);
    expect(events[0]?.markdown).toContain("Drift halt");
  });
});

describe("CheckpointCoordinator — Layer 3 signals", () => {
  it("requestPause + waitWhilePaused + requestResume round-trips", async () => {
    const c = CheckpointCoordinator.tui();
    c.requestPause();
    expect(c.isPaused()).toBe(true);

    const pending = c.waitWhilePaused();
    let resolved = false;
    void pending.then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);

    c.requestResume();
    await pending;
    expect(resolved).toBe(true);
    expect(c.isPaused()).toBe(false);
  });

  it("requestSkip marks tasks; isTaskSkipped reads", () => {
    const c = CheckpointCoordinator.tui();
    c.requestSkip("t42");
    expect(c.isTaskSkipped("t42")).toBe(true);
    expect(c.isTaskSkipped("t-other")).toBe(false);
  });

  it("requestSkip rejects empty id", () => {
    const c = CheckpointCoordinator.tui();
    let rejected = false;
    c.on("checkpoint:skip_rejected", () => (rejected = true));
    c.requestSkip("   ");
    expect(rejected).toBe(true);
  });

  it("requestAbort sets the abort flag and unblocks pending paused waiters", async () => {
    const c = CheckpointCoordinator.tui();
    c.requestPause();
    const pending = c.waitWhilePaused();
    let done = false;
    void pending.then(() => (done = true));
    await new Promise((r) => setTimeout(r, 5));
    c.requestAbort();
    await pending;
    expect(done).toBe(true);
    expect(c.isAbortRequested()).toBe(true);
  });
});

describe("CheckpointCoordinator — reorder", () => {
  it("rejects empty reorder", () => {
    const c = CheckpointCoordinator.tui();
    let rejected: { reason: string } | null = null;
    c.on("checkpoint:reorder_rejected", (e: { reason: string }) => (rejected = e));
    c.requestReorder("p1", []);
    expect(rejected !== null && (rejected as { reason: string }).reason).toBe("empty list");
  });

  it("rejects duplicate ids", () => {
    const c = CheckpointCoordinator.tui();
    let rejected: { reason: string } | null = null;
    c.on("checkpoint:reorder_rejected", (e: { reason: string }) => (rejected = e));
    c.requestReorder("p1", ["t1", "t2", "t1"]);
    expect(rejected !== null && (rejected as { reason: string }).reason).toContain("duplicate");
  });

  it("queues reorder and consumes it once", () => {
    const c = CheckpointCoordinator.tui();
    c.requestReorder("p1", ["t2", "t1"]);
    expect(c.consumePendingReorder("p1")).toEqual(["t2", "t1"]);
    expect(c.consumePendingReorder("p1")).toBeNull();
  });
});

describe("validateReorder", () => {
  const p = phase("p1", ["t1", "t2", "t3"]);

  it("accepts a valid permutation that respects deps", () => {
    // The default phase fixture chains deps t1 → t2 → t3, so the only
    // valid order is the original one.
    expect(validateReorder(p, ["t1", "t2", "t3"])).toBeNull();
  });

  it("rejects length mismatch", () => {
    expect(validateReorder(p, ["t1", "t2"])).toContain("length mismatch");
  });

  it("rejects unknown task id", () => {
    expect(validateReorder(p, ["t1", "t2", "tX"])).toContain("unknown task id");
  });

  it("rejects out-of-order deps (would-be cycle)", () => {
    // t2 depends on t1 in the fixture; placing t2 before t1 is invalid.
    expect(validateReorder(p, ["t2", "t1", "t3"])).toContain("cycle");
  });
});

describe("CheckpointCoordinator — drift reanchor flow", () => {
  it("resolveReanchor with continue resolves the wait", async () => {
    const c = CheckpointCoordinator.tui();
    const events: string[] = [];
    c.on("checkpoint:reanchor_open", () => events.push("open"));
    c.on("checkpoint:reanchor_resolved", () => events.push("resolved"));

    const pending = c.waitForReanchor({ reanchor });
    await new Promise((r) => setTimeout(r, 5));
    c.resolveReanchor({ option: "continue" });
    const result = await pending;
    expect(result.option).toBe("continue");
    expect(events).toEqual(["open", "resolved"]);
  });

  it("edit_goal requires non-empty new_goal", async () => {
    const c = CheckpointCoordinator.tui();
    const pending = c.waitForReanchor({ reanchor });
    await new Promise((r) => setTimeout(r, 5));
    let rejected = false;
    c.on("checkpoint:reanchor_rejected", () => (rejected = true));

    const ok1 = c.resolveReanchor({ option: "edit_goal", new_goal: "" });
    expect(ok1).toBe(false);
    expect(rejected).toBe(true);

    c.resolveReanchor({ option: "edit_goal", new_goal: "Build a CLI tool" });
    const result = await pending;
    expect(result.option).toBe("edit_goal");
    expect(result.new_goal).toBe("Build a CLI tool");
  });

  it("requestResume on pending reanchor maps to continue", async () => {
    const c = CheckpointCoordinator.tui();
    const pending = c.waitForReanchor({ reanchor });
    await new Promise((r) => setTimeout(r, 5));
    c.requestResume();
    const result = await pending;
    expect(result.option).toBe("continue");
  });
});
