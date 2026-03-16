import { describe, it, expect } from "vitest";
import { extractSuccessPattern, extractKeywords, buildEmbeddingText } from "../src/memory/success/extractor.js";
import type { TaskForExtraction } from "../src/memory/success/extractor.js";

function makeTask(overrides: Partial<TaskForExtraction> = {}): TaskForExtraction {
  return {
    task_id: "TASK-001",
    description: "Implement user authentication flow",
    assigned_to: "bot_0",
    status: "completed",
    retry_count: 0,
    result: {
      output: "Implemented OAuth2 flow with JWT tokens and refresh token rotation",
      confidence: { score: 0.92 },
    },
    ...overrides,
  };
}

describe("extractSuccessPattern", () => {
  it("extracts pattern from approved task with reworkCount 0", () => {
    const task = makeTask();
    const pattern = extractSuccessPattern(task, "Build auth system", "session-1", 1);
    expect(pattern).not.toBeNull();
    expect(pattern!.taskDescription).toBe("Implement user authentication flow");
    expect(pattern!.confidence).toBe(0.92);
    expect(pattern!.approvalType).toBe("user");
    expect(pattern!.reworkCount).toBe(0);
    expect(pattern!.id).toMatch(/^success_/);
    expect(pattern!.goalContext).toBe("Build auth system");
    expect(pattern!.sessionId).toBe("session-1");
    expect(pattern!.runIndex).toBe(1);
  });

  it("extracts pattern from approved task with reworkCount 1", () => {
    const task = makeTask({ retry_count: 1 });
    const pattern = extractSuccessPattern(task, "goal", "s1", 2);
    expect(pattern).not.toBeNull();
    expect(pattern!.reworkCount).toBe(1);
  });

  it("extracts pattern from auto-approved task", () => {
    const task = makeTask({ status: "auto_approved_pending" });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).not.toBeNull();
    expect(pattern!.approvalType).toBe("auto");
  });

  it("skips task with reworkCount >= 2", () => {
    const task = makeTask({ retry_count: 2 });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).toBeNull();
  });

  it("skips rejected tasks", () => {
    const task = makeTask({ status: "needs_rework" });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).toBeNull();
  });

  it("skips escalated tasks", () => {
    const task = makeTask({ status: "escalated" });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).toBeNull();
  });

  it("skips pending tasks", () => {
    const task = makeTask({ status: "pending" });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).toBeNull();
  });

  it("defaults confidence to 0.5 when missing", () => {
    const task = makeTask({ result: { output: "done" } });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).not.toBeNull();
    expect(pattern!.confidence).toBe(0.5);
  });

  it("truncates approach to 300 chars", () => {
    const longOutput = "x".repeat(500);
    const task = makeTask({ result: { output: longOutput, confidence: { score: 0.8 } } });
    const pattern = extractSuccessPattern(task, "goal", "s1", 1);
    expect(pattern).not.toBeNull();
    expect(pattern!.approach.length).toBe(300);
  });
});

describe("extractKeywords", () => {
  it("extracts meaningful words", () => {
    const keywords = extractKeywords("Implement the user authentication flow with OAuth");
    expect(keywords).toContain("implement");
    expect(keywords).toContain("user");
    expect(keywords).toContain("authentication");
    expect(keywords).toContain("oauth");
  });

  it("filters stop words", () => {
    const keywords = extractKeywords("the a an is it of in to and or");
    expect(keywords).toHaveLength(0);
  });

  it("deduplicates and limits to 10", () => {
    const text = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const keywords = extractKeywords(text);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it("handles empty input", () => {
    expect(extractKeywords("")).toHaveLength(0);
  });

  it("handles special characters", () => {
    const keywords = extractKeywords("hello-world foo_bar baz123");
    expect(keywords.length).toBeGreaterThan(0);
  });
});

describe("buildEmbeddingText", () => {
  it("concatenates fields correctly", () => {
    const text = buildEmbeddingText({
      taskDescription: "Build auth",
      approach: "Used OAuth2",
      goalContext: "Security system",
    });
    expect(text).toBe("Build auth Used OAuth2 Security system");
  });

  it("handles empty fields", () => {
    const text = buildEmbeddingText({
      taskDescription: "",
      approach: "",
      goalContext: "",
    });
    expect(text).toBe("  ");
  });
});
