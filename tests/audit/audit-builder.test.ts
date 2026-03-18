import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuditTrail } from "@/audit/builder.js";
import * as storage from "@/replay/storage.js";

vi.mock("@/replay/storage.js");

const baseTime = 1700000000000;

const mockState: Record<string, unknown> = {
  user_goal: "Build auth module",
  task_queue: [
    { task_id: "t-1", status: "completed", assigned_to: "bot-0", result: { success: true, output: "done", quality_score: 0.9, confidence: { score: 0.88, reasoning: "clear", flags: [] } } },
    { task_id: "t-2", status: "failed", assigned_to: "bot-1", result: { success: false, output: "error", quality_score: 0, routing_decision: "rework" } },
    { task_id: "t-3", status: "waiting_for_human", assigned_to: "bot-0", result: { success: true, output: "ok", quality_score: 0.8 }, reviewer_feedback: "looks good" },
  ],
  bot_stats: {
    "bot-0": { tasks_completed: 2, tasks_failed: 0 },
    "bot-1": { tasks_completed: 0, tasks_failed: 1 },
  },
  approval_stats: {
    autoApprovedCount: 1,
    manualApprovedCount: 1,
    rejectedCount: 0,
    escalatedCount: 0,
  },
  average_confidence: 0.85,
  routing_decisions: [],
  memory_context: {
    successPatterns: ["p1", "p2"],
    failureLessons: ["l1"],
  },
  new_success_patterns: ["np1", "np2", "np3"],
  promoted_this_run: ["promoted1"],
  agent_profiles: [],
};

const mockTeam = [
  { id: "bot-0", name: "Worker", role_id: "software_engineer", traits: {}, worker_url: null },
  { id: "bot-1", name: "Reviewer", role_id: "qa_reviewer", traits: {}, worker_url: null },
];

describe("buildAuditTrail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storage.readRecordingEvents).mockResolvedValue([]);
  });

  it("compiles all sections from GraphState", async () => {
    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    expect(audit.sessionId).toBe("sess-1");
    expect(audit.runIndex).toBe(1);
    expect(audit.goal).toBe("Build auth module");
    expect(audit.durationMs).toBe(60000);
    expect(audit.teamComposition).toHaveLength(2);
  });

  it("builds correct summary", async () => {
    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    expect(audit.summary.tasksCompleted).toBe(2); // completed + waiting_for_human
    expect(audit.summary.tasksFailed).toBe(1);
    expect(audit.summary.autoApproved).toBe(1);
    expect(audit.summary.userApproved).toBe(1);
    expect(audit.summary.averageConfidence).toBe(0.85);
  });

  it("builds approval history from task queue", async () => {
    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    expect(audit.approvalHistory.length).toBeGreaterThanOrEqual(2);
    const completed = audit.approvalHistory.find((a) => a.taskId === "t-1");
    expect(completed).toBeDefined();
  });

  it("builds memory usage", async () => {
    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    expect(audit.memoryUsage.successPatternsRetrieved).toBe(2);
    expect(audit.memoryUsage.failureLessonsRetrieved).toBe(1);
    expect(audit.memoryUsage.newPatternsStored).toBe(3);
    expect(audit.memoryUsage.globalPatternsPromoted).toBe(1);
  });

  it("builds cost breakdown per agent", async () => {
    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    expect(audit.costBreakdown.length).toBeGreaterThanOrEqual(1);
    const worker = audit.costBreakdown.find((c) => c.agent.includes("Software") || c.agent.includes("Worker"));
    expect(worker).toBeDefined();
  });

  it("handles missing recording gracefully", async () => {
    vi.mocked(storage.readRecordingEvents).mockRejectedValue(new Error("not found"));

    const audit = await buildAuditTrail("sess-1", 1, mockState, baseTime, baseTime + 60000, mockTeam);

    // Should still produce a valid audit even without recording
    expect(audit.sessionId).toBe("sess-1");
    expect(audit.summary.tasksCompleted).toBe(2);
    expect(audit.decisionLog).toEqual([]); // no recording events = no decision log
  });

  it("handles empty state gracefully", async () => {
    const audit = await buildAuditTrail("sess-1", 1, {}, baseTime, baseTime + 60000, []);

    expect(audit.sessionId).toBe("sess-1");
    expect(audit.summary.tasksCompleted).toBe(0);
    expect(audit.summary.tasksFailed).toBe(0);
    expect(audit.decisionLog).toEqual([]);
    expect(audit.approvalHistory).toEqual([]);
    expect(audit.costBreakdown).toEqual([]);
  });
});
