import { describe, expect, it } from "bun:test";
import type {
  CrewRunResult,
  RunCrewArgs,
} from "../crew/crew-runner.js";
import { CheckpointCoordinator } from "../crew/checkpoints.js";
import { FULL_STACK_PRESET } from "../crew/manifest/index.js";
import { runCrewHeadless } from "./run-crew-headless.js";

function completedResult(): CrewRunResult {
  return {
    status: "completed",
    session_id: "test-session",
    crew_name: "full-stack",
    goal: "ship it",
    phases: [],
    plan_artifact_id: "a-1",
    phase_summary_artifact_ids: ["a-2"],
    tokens_used: 1234,
    ended_by: "all_phases_complete",
  };
}

function planFailedResult(): CrewRunResult {
  return {
    status: "plan_failed",
    session_id: "test-session",
    crew_name: "full-stack",
    goal: "ship it",
    error: {
      reason: "dependency_cycle",
      message: "t1 → t2 → t1",
      detail: { cycle: ["t1", "t2", "t1"] },
    },
    attempts: 2,
  };
}

describe("runCrewHeadless", () => {
  it("happy path: forwards goal+crewName+workdir and returns exitCode 0 on completed", async () => {
    let captured: RunCrewArgs | null = null;
    const result = await runCrewHeadless({
      goal: "Add health endpoint",
      crewName: FULL_STACK_PRESET,
      workdir: "/tmp/headless-test",
      runCrewImpl: async (args) => {
        captured = args;
        return completedResult();
      },
    });

    expect(result.exitCode).toBe(0);
    expect(captured).not.toBeNull();
    expect(captured!.options.goal).toBe("Add health endpoint");
    expect(captured!.options.crew_name).toBe("full-stack");
    expect(captured!.options.workdir).toBe("/tmp/headless-test");
    expect(captured!.workdir).toBe("/tmp/headless-test");
    // Session id should be generated, not undefined.
    expect(captured!.session_id).toMatch(/^print-\d+$/);
    // Tool wiring should be present (not undefined) — the helper builds it.
    expect(typeof captured!.executeTool).toBe("function");
    expect(typeof captured!.getToolSchemas).toBe("function");
    expect(typeof captured!.getNativeTools).toBe("function");
    expect(typeof captured!.onProgress).toBe("function");
  });

  it("defaults crewName to FULL_STACK_PRESET and workdir to cwd", async () => {
    let captured: RunCrewArgs | null = null;
    const result = await runCrewHeadless({
      goal: "x",
      runCrewImpl: async (args) => {
        captured = args;
        return completedResult();
      },
    });

    expect(result.exitCode).toBe(0);
    expect(captured!.options.crew_name).toBe(FULL_STACK_PRESET);
    expect(captured!.options.workdir).toBe(process.cwd());
  });

  it("returns exitCode 1 on plan_failed", async () => {
    const result = await runCrewHeadless({
      goal: "x",
      runCrewImpl: async () => planFailedResult(),
    });
    expect(result.exitCode).toBe(1);
  });

  it("returns exitCode 1 when runCrew throws and prints stderr message", async () => {
    const originalErr = console.error;
    let stderrMessage = "";
    console.error = (msg: string) => {
      stderrMessage += msg + "\n";
    };

    try {
      const result = await runCrewHeadless({
        goal: "x",
        runCrewImpl: async () => {
          throw new Error("preset 'does-not-exist' not found");
        },
      });
      expect(result.exitCode).toBe(1);
      expect(stderrMessage).toContain("Crew run failed:");
      expect(stderrMessage).toContain("does-not-exist");
    } finally {
      console.error = originalErr;
    }
  });

  it("passes a headless CheckpointCoordinator (auto-advance, no input wait)", async () => {
    let captured: RunCrewArgs | null = null;
    await runCrewHeadless({
      goal: "x",
      runCrewImpl: async (args) => {
        captured = args;
        return completedResult();
      },
    });

    expect(captured!.checkpointCoordinator).toBeInstanceOf(CheckpointCoordinator);
    expect(captured!.checkpointCoordinator!.mode).toBe("headless");
  });
});
