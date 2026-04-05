import { describe, it, expect } from "vitest";
import { generateResumeCommands } from "@/handoff/resume-generator.js";
import type { LeftToDoItem } from "@/handoff/types.js";

describe("generateResumeCommands", () => {
  it("generates work command for each leftToDo item", () => {
    const items: LeftToDoItem[] = [
      { description: "Finish auth module", type: "open_task", priority: "high" },
      { description: "Add tests", type: "deferred", priority: "medium" },
    ];
    const result = generateResumeCommands(items, 0);
    expect(result).toEqual([
      'openpawl work --goal "Finish auth module"',
      'openpawl work --goal "Add tests"',
    ]);
  });

  it("uses item.command when provided", () => {
    const items: LeftToDoItem[] = [
      {
        description: "Run migrations",
        type: "open_task",
        priority: "high",
        command: "openpawl run migrate",
      },
    ];
    const result = generateResumeCommands(items, 0);
    expect(result).toEqual(["openpawl run migrate"]);
  });

  it("limits to 3 leftToDo commands", () => {
    const items: LeftToDoItem[] = Array.from({ length: 5 }, (_, i) => ({
      description: `Task ${i + 1}`,
      type: "open_task" as const,
      priority: "medium" as const,
    }));
    const result = generateResumeCommands(items, 0);
    expect(result).toHaveLength(3);
    expect(result[0]).toContain("Task 1");
    expect(result[2]).toContain("Task 3");
  });

  it("adds journal list when decisionCount > 3", () => {
    const items: LeftToDoItem[] = [
      { description: "Do something", type: "open_task", priority: "low" },
    ];
    const result = generateResumeCommands(items, 5);
    expect(result).toContain("openpawl journal list");
  });

  it("does not add journal list when decisionCount <= 3", () => {
    const items: LeftToDoItem[] = [
      { description: "Do something", type: "open_task", priority: "low" },
    ];
    const result = generateResumeCommands(items, 3);
    expect(result).not.toContain("openpawl journal list");
  });

  it("adds think command for escalated items", () => {
    const items: LeftToDoItem[] = [
      {
        description: "Resolve architecture conflict",
        type: "escalated",
        priority: "high",
      },
    ];
    const result = generateResumeCommands(items, 0);
    expect(result).toContain(
      'openpawl think "Resolve architecture conflict"',
    );
  });

  it("returns empty array when no items", () => {
    const result = generateResumeCommands([], 0);
    expect(result).toEqual([]);
  });
});
