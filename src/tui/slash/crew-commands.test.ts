import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  createAbortCommand,
  createAdjustCommand,
  createContinueCommand,
  createCrewStatusCommand,
  createPauseCommand,
  createReorderCommand,
  createSkipCommand,
  registerCrewCommands,
} from "./crew-commands.js";
import { CommandRegistry } from "./registry.js";
import type { CommandContext } from "./registry.js";
import { CheckpointCoordinator } from "../../crew/checkpoints.js";
import {
  clearActiveCrew,
  setActiveCrew,
} from "../../crew/checkpoint-registry.js";
import { CrewPhaseSchema } from "../../crew/types.js";
import type { CrewManifest } from "../../crew/manifest/index.js";

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function makeCtx(): {
  ctx: CommandContext;
  messages: Array<{ role: string; content: string }>;
} {
  const messages: Array<{ role: string; content: string }> = [];
  return {
    messages,
    ctx: {
      addMessage: (role, content) => messages.push({ role, content }),
      clearMessages: () => {
        messages.length = 0;
      },
      requestRender: () => {},
      exit: () => {},
    },
  };
}

const fixtureManifest: CrewManifest = {
  name: "full-stack",
  description: "test crew",
  version: "1.0.0",
  constraints: {
    min_agents: 2,
    max_agents: 10,
    recommended_range: [3, 5],
    required_roles: [],
  },
  agents: [
    {
      id: "planner",
      name: "Planner",
      description: "Plans",
      prompt: "You plan.",
      tools: ["file_read"],
    },
    {
      id: "coder",
      name: "Coder",
      description: "Codes",
      prompt: "You code.",
      tools: ["file_read", "file_write"],
    },
  ],
};

function fixturePhases() {
  return [
    CrewPhaseSchema.parse({
      id: "p1",
      name: "Scaffold",
      description: "x",
      complexity_tier: "2",
      tasks: [
        {
          id: "t1",
          phase_id: "p1",
          description: "first",
          assigned_agent: "coder",
          depends_on: [],
          status: "in_progress",
        },
        {
          id: "t2",
          phase_id: "p1",
          description: "second",
          assigned_agent: "coder",
          depends_on: ["t1"],
        },
      ],
    }),
    CrewPhaseSchema.parse({
      id: "p2",
      name: "Test",
      description: "y",
      complexity_tier: "2",
      tasks: [
        {
          id: "t3",
          phase_id: "p2",
          description: "third",
          assigned_agent: "coder",
          depends_on: [],
        },
      ],
    }),
  ];
}

let coord: CheckpointCoordinator;

beforeEach(() => {
  coord = CheckpointCoordinator.tui();
  setActiveCrew({
    coordinator: coord,
    session_id: "sess-1",
    manifest: fixtureManifest,
    goal: "Add /health",
    phases: fixturePhases(),
    current_phase_index: 0,
  });
});
afterEach(() => {
  clearActiveCrew();
});

describe("/pause", () => {
  it("calls requestPause on the active coordinator", async () => {
    const { ctx, messages } = makeCtx();
    await createPauseCommand().execute("", ctx);
    expect(coord.isPaused()).toBe(true);
    expect(strip(messages[0]?.content ?? "")).toContain("Pause requested");
  });

  it("shows 'no active crew' when none registered", async () => {
    clearActiveCrew();
    const { ctx, messages } = makeCtx();
    await createPauseCommand().execute("", ctx);
    expect(strip(messages[0]?.content ?? "")).toContain("No active crew");
  });
});

describe("/continue", () => {
  it("resumes a paused coordinator", async () => {
    coord.requestPause();
    expect(coord.isPaused()).toBe(true);
    const { ctx } = makeCtx();
    await createContinueCommand().execute("", ctx);
    expect(coord.isPaused()).toBe(false);
  });

  it("resolves a pending phase gate", async () => {
    const events: string[] = [];
    coord.on("checkpoint:phase_resumed", (e: { action: string }) => events.push(e.action));
    const pending = coord.waitForPhaseAdvance({
      phase: fixturePhases()[0]!,
      summary_artifact_id: "a1",
    });
    await new Promise((r) => setTimeout(r, 5));
    const { ctx } = makeCtx();
    await createContinueCommand().execute("", ctx);
    expect(await pending).toBe("continue");
    expect(events).toEqual(["continue"]);
  });
});

describe("/skip", () => {
  it("with explicit task id queues the skip", async () => {
    const { ctx, messages } = makeCtx();
    await createSkipCommand().execute("t2", ctx);
    expect(coord.isTaskSkipped("t2")).toBe(true);
    expect(strip(messages[0]?.content ?? "")).toContain("t2");
  });

  it("with no arg picks the in-progress task off the active phase", async () => {
    const { ctx, messages } = makeCtx();
    await createSkipCommand().execute("", ctx);
    // t1 is the in-progress task in the fixture.
    expect(coord.isTaskSkipped("t1")).toBe(true);
    expect(strip(messages[0]?.content ?? "")).toContain("t1");
  });

  it("errors when no in-progress task and no arg given", async () => {
    setActiveCrew({
      coordinator: coord,
      session_id: "sess-1",
      manifest: fixtureManifest,
      goal: "x",
      phases: [
        CrewPhaseSchema.parse({
          id: "p1",
          name: "all done",
          description: "x",
          complexity_tier: "1",
          tasks: [
            {
              id: "tx",
              phase_id: "p1",
              description: "done",
              assigned_agent: "coder",
              depends_on: [],
              status: "completed",
            },
          ],
        }),
      ],
      current_phase_index: 0,
    });
    const { ctx, messages } = makeCtx();
    await createSkipCommand().execute("", ctx);
    expect(messages[0]?.role).toBe("error");
  });
});

describe("/reorder", () => {
  it("queues a valid reorder for the next pending phase", async () => {
    // The "next pending phase" after the active one (p1) is p2 with tasks [t3].
    const { ctx, messages } = makeCtx();
    await createReorderCommand().execute("t3", ctx);
    expect(coord.consumePendingReorder("p2")).toEqual(["t3"]);
    expect(strip(messages[0]?.content ?? "")).toContain("p2");
  });

  it("rejects unknown task ids", async () => {
    const { ctx, messages } = makeCtx();
    await createReorderCommand().execute("tX, tY", ctx);
    expect(messages[0]?.role).toBe("error");
    expect(strip(messages[0]?.content ?? "")).toContain("Unknown");
    expect(coord.consumePendingReorder("p2")).toBeNull();
  });

  it("usage error on empty args", async () => {
    const { ctx, messages } = makeCtx();
    await createReorderCommand().execute("", ctx);
    expect(messages[0]?.role).toBe("error");
    expect(strip(messages[0]?.content ?? "")).toContain("Usage:");
  });

  it("accepts comma- and space-separated ids", async () => {
    // Reorder p1's pending tasks (it has t1 in_progress, t2 pending).
    setActiveCrew({
      coordinator: coord,
      session_id: "sess-1",
      manifest: fixtureManifest,
      goal: "x",
      phases: fixturePhases(),
      current_phase_index: -1, // not yet entered any phase → next pending is p1
    });
    const { ctx } = makeCtx();
    await createReorderCommand().execute("t1, t2", ctx);
    expect(coord.consumePendingReorder("p1")).toEqual(["t1", "t2"]);
  });
});

describe("/abort", () => {
  it("requests abort on the active coordinator", async () => {
    const { ctx, messages } = makeCtx();
    await createAbortCommand().execute("", ctx);
    expect(coord.isAbortRequested()).toBe(true);
    expect(strip(messages[0]?.content ?? "")).toContain("Abort signaled");
  });
});

describe("/adjust", () => {
  it("only resolves when a phase gate is open", async () => {
    const { ctx, messages } = makeCtx();
    await createAdjustCommand().execute("", ctx);
    expect(strip(messages[0]?.content ?? "")).toContain("only valid");
  });

  it("resolves a pending phase gate with adjust", async () => {
    const c2 = CheckpointCoordinator.tui({ strict_mode: true });
    setActiveCrew({
      coordinator: c2,
      session_id: "s2",
      manifest: fixtureManifest,
      goal: "x",
      phases: fixturePhases(),
      current_phase_index: 0,
    });
    const pending = c2.waitForPhaseAdvance({
      phase: fixturePhases()[0]!,
      summary_artifact_id: "a1",
    });
    await new Promise((r) => setTimeout(r, 5));
    const { ctx } = makeCtx();
    await createAdjustCommand().execute("", ctx);
    expect(await pending).toBe("adjust");
  });
});

describe("/crew", () => {
  it("renders crew composition + run status", async () => {
    const { ctx, messages } = makeCtx();
    await createCrewStatusCommand().execute("", ctx);
    const out = strip(messages[0]?.content ?? "");
    expect(out).toContain("Crew status");
    expect(out).toContain("full-stack");
    expect(out).toContain("planner");
    expect(out).toContain("coder");
    expect(out).toContain("Add /health");
    // Phase progress: 1/2 — Scaffold
    expect(out).toContain("Scaffold");
    expect(out).toContain("running");
  });

  it("shows 'no active crew' when none", async () => {
    clearActiveCrew();
    const { ctx, messages } = makeCtx();
    await createCrewStatusCommand().execute("", ctx);
    expect(strip(messages[0]?.content ?? "")).toContain("No active crew");
  });
});

describe("registerCrewCommands", () => {
  it("registers all 7 commands", () => {
    const reg = new CommandRegistry();
    registerCrewCommands(reg);
    const all = reg.getAll();
    const names = all.map((c) => c.name).sort();
    expect(names).toEqual([
      "abort",
      "adjust",
      "continue",
      "crew",
      "pause",
      "reorder",
      "skip",
    ]);
  });
});
