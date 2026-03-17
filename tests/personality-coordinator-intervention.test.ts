import { describe, it, expect } from "vitest";
import { detectCoordinatorIntervention } from "../src/personality/coordinator-intervention.js";

describe("detectCoordinatorIntervention", () => {
  it("triggers when a task has cycled through rework 3+ times", () => {
    const state = {
      confidence_history: [
        { task_id: "t1", status_before: "pending", status_after: "needs_rework" },
        { task_id: "t1", status_before: "needs_rework", status_after: "completed" },
        { task_id: "t1", status_before: "completed", status_after: "needs_rework" },
        { task_id: "t1", status_before: "needs_rework", status_after: "needs_rework" },
      ],
    };

    const result = detectCoordinatorIntervention(state);
    expect(result).not.toBeNull();
    expect(result!.taskId).toBe("t1");
    expect(result!.visitCount).toBeGreaterThan(2);
    expect(result!.message).toContain("t1");
  });

  it("does not trigger when a task has only 2 rework cycles", () => {
    const state = {
      confidence_history: [
        { task_id: "t1", status_before: "pending", status_after: "needs_rework" },
        { task_id: "t1", status_before: "needs_rework", status_after: "completed" },
      ],
    };

    const result = detectCoordinatorIntervention(state);
    expect(result).toBeNull();
  });

  it("returns null for empty confidence_history", () => {
    expect(detectCoordinatorIntervention({ confidence_history: [] })).toBeNull();
  });

  it("returns null for undefined confidence_history", () => {
    expect(detectCoordinatorIntervention({})).toBeNull();
  });

  it("intervention message includes task ID and cycle count", () => {
    const state = {
      confidence_history: [
        { task_id: "task-abc", status_before: "needs_rework", status_after: "needs_rework" },
        { task_id: "task-abc", status_before: "needs_rework", status_after: "completed" },
        { task_id: "task-abc", status_before: "completed", status_after: "needs_rework" },
      ],
    };

    const result = detectCoordinatorIntervention(state);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("task-abc");
    expect(result!.message).toContain(String(result!.visitCount));
  });

  it("only triggers for the stuck task, not others", () => {
    const state = {
      confidence_history: [
        { task_id: "t1", status_before: "pending", status_after: "completed" },
        { task_id: "t2", status_before: "needs_rework", status_after: "needs_rework" },
        { task_id: "t2", status_before: "needs_rework", status_after: "needs_rework" },
        { task_id: "t2", status_before: "needs_rework", status_after: "completed" },
      ],
    };

    const result = detectCoordinatorIntervention(state);
    expect(result).not.toBeNull();
    expect(result!.taskId).toBe("t2");
  });
});
