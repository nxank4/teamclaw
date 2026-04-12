/**
 * Task parser — extracts structured tasks from planner LLM output.
 * Uses defensive JSON parsing with multiple fallback layers.
 */
import type { SprintTask } from "./types.js";
import { safeJsonParse } from "../utils/safe-json-parse.js";

export function parseTasks(plannerOutput: string): SprintTask[] {
  if (!plannerOutput.trim()) return [];

  // Try defensive JSON parse (handles fences, XML tags, truncated JSON)
  const result = safeJsonParse<unknown[]>(plannerOutput);
  if (result.parsed && Array.isArray(result.data)) {
    const tasks = toSprintTasks(result.data);
    if (tasks.length > 0) return tasks;
  }

  // Fallback: numbered list (1. Description, 2. Description, ...)
  return parseNumberedList(plannerOutput);
}

function toSprintTasks(arr: unknown[]): SprintTask[] {
  return arr
    .filter((item: unknown) => typeof item === "object" && item !== null && "description" in item)
    .map((item: Record<string, unknown>, i: number) => {
      const task: SprintTask = {
        id: `task-${i + 1}`,
        description: String(item["description"]),
        status: "pending" as const,
      };
      if (Array.isArray(item["dependsOn"])) {
        const deps = (item["dependsOn"] as unknown[]).filter((n): n is number => typeof n === "number");
        if (deps.length > 0) task.dependsOn = deps;
      }
      if (typeof item["agent"] === "string" && item["agent"]) {
        task.assignedAgent = String(item["agent"]).trim();
      }
      return task;
    });
}

function parseNumberedList(text: string): SprintTask[] {
  const tasks: SprintTask[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+(.+)/);
    if (match) {
      tasks.push({
        id: `task-${tasks.length + 1}`,
        description: match[1]!.trim(),
        status: "pending",
      });
    }
  }

  return tasks;
}
