import { describe, it, expect } from "vitest";
import { renderAuditMarkdown, renderMultiRunSummary } from "@/audit/renderers/markdown.js";
import type { AuditTrail, MultiRunSummary } from "@/audit/types.js";

const baseTime = 1700000000000;

const mockAudit: AuditTrail = {
  sessionId: "sess-test",
  runIndex: 1,
  goal: "Build test feature",
  startedAt: baseTime,
  completedAt: baseTime + 120000,
  durationMs: 120000,
  teamComposition: ["Software Engineer", "QA Reviewer"],
  summary: {
    tasksCompleted: 3,
    tasksFailed: 1,
    autoApproved: 2,
    userApproved: 1,
    rejected: 0,
    escalated: 0,
    averageConfidence: 0.87,
    totalTokensInput: 5000,
    totalTokensOutput: 1000,
    totalCostUSD: 0.134,
  },
  decisionLog: [
    { timestamp: baseTime, nodeId: "coordinator", phase: "exit", decision: "Decomposed into 4 tasks", data: {} },
    { timestamp: baseTime + 5000, nodeId: "worker_task", phase: "exit", decision: "Worker completed task t-1", data: { confidence: 0.91, durationMs: 3000 } },
  ],
  approvalHistory: [
    { taskId: "t-1", action: "auto-approved", by: "system", at: baseTime + 8000, feedback: null, confidence: 0.91 },
    { taskId: "t-2", action: "approved", by: "user", at: baseTime + 12000, feedback: null, confidence: 0.78 },
    { taskId: "t-3", action: "rejected", by: "user", at: baseTime + 20000, feedback: "Use PKCE flow", confidence: 0.65 },
  ],
  costBreakdown: [
    { agent: "Software Engineer", tasks: 3, tokensInput: 3000, tokensOutput: 800, costUSD: 0.08 },
    { agent: "QA Reviewer", tasks: 1, tokensInput: 2000, tokensOutput: 200, costUSD: 0.054 },
  ],
  memoryUsage: {
    successPatternsRetrieved: 3,
    failureLessonsRetrieved: 1,
    newPatternsStored: 4,
    globalPatternsPromoted: 2,
  },
  agentPerformance: [
    { agent: "Software Engineer", roleId: "software_engineer", tasks: 3, avgConfidence: 0.88, vsProfile: 0.04, trend: "up" },
    { agent: "QA Reviewer", roleId: "qa_reviewer", tasks: 1, avgConfidence: 0.79, vsProfile: -0.02, trend: "down" },
  ],
};

describe("renderAuditMarkdown", () => {
  it("produces valid CommonMark structure", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("# OpenPawl Audit Trail");
    expect(md).toContain("## Sprint Summary");
    expect(md).toContain("## Decision Log");
    expect(md).toContain("## Approval History");
    expect(md).toContain("## Cost Breakdown");
    expect(md).toContain("## Memory Usage");
    expect(md).toContain("## Agent Performance");
  });

  it("includes session metadata in header", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("**Session:** sess-test");
    expect(md).toContain("**Goal:** Build test feature");
    expect(md).toContain("**Total Cost:** $0.13");
    expect(md).toContain("Software Engineer, QA Reviewer");
  });

  it("renders summary section with correct numbers", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("Tasks completed: 3");
    expect(md).toContain("Tasks failed: 1");
    expect(md).toContain("Auto-approved: 2");
    expect(md).toContain("Average confidence: 0.87");
  });

  it("renders approval history table", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("| Task | Action | By | Confidence | Feedback |");
    expect(md).toContain("| t-1 | auto-approved | system | 0.91 |");
    expect(md).toContain("| t-3 | rejected | user | 0.65 | \"Use PKCE flow\" |");
  });

  it("renders cost breakdown table with totals", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("| Software Engineer |");
    expect(md).toContain("| **Total** |");
  });

  it("renders agent performance with trends", () => {
    const md = renderAuditMarkdown(mockAudit);

    expect(md).toContain("+0.04");
    expect(md).toContain("-0.02");
  });

  it("omits excluded sections", () => {
    const md = renderAuditMarkdown(mockAudit, {
      sections: {
        decisionLog: false,
        approvalHistory: false,
        costBreakdown: true,
        memoryUsage: false,
        agentPerformance: false,
        rawPrompts: false,
      },
    });

    expect(md).not.toContain("## Decision Log");
    expect(md).not.toContain("## Approval History");
    expect(md).toContain("## Cost Breakdown");
    expect(md).not.toContain("## Memory Usage");
    expect(md).not.toContain("## Agent Performance");
  });

  it("handles empty decision log", () => {
    const emptyAudit = { ...mockAudit, decisionLog: [] };
    const md = renderAuditMarkdown(emptyAudit);
    expect(md).toContain("No decision events recorded.");
  });
});

describe("renderMultiRunSummary", () => {
  it("renders multi-run summary with confidence trend", () => {
    const summary: MultiRunSummary = {
      sessionId: "sess-multi",
      totalRuns: 3,
      runs: [mockAudit, mockAudit, mockAudit],
      confidenceTrend: [0.75, 0.82, 0.89],
      costPerRun: [0.12, 0.10, 0.08],
      patternsPromoted: ["pattern-1", "pattern-2"],
      totalCostUSD: 0.30,
      totalDurationMs: 360000,
    };

    const md = renderMultiRunSummary(summary);

    expect(md).toContain("# OpenPawl Multi-Run Summary");
    expect(md).toContain("**Total Runs:** 3");
    expect(md).toContain("## Confidence Trend");
    expect(md).toContain("Run 1:");
    expect(md).toContain("Run 3:");
    expect(md).toContain("## Cost Per Run");
    expect(md).toContain("## Patterns Promoted");
    expect(md).toContain("pattern-1");
  });
});
