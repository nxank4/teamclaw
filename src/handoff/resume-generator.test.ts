import { describe, expect, it } from "bun:test";

import { generateResumeCommands } from "./resume-generator.js";
import type { LeftToDoItem } from "./types.js";

describe("generateResumeCommands", () => {
  it("emits `openpawl -p` (not stale `run --headless`) for items without an explicit command", () => {
    const items: LeftToDoItem[] = [
      { description: "wire up the auth callback", type: "open_task", priority: "high" },
    ];

    const [first] = generateResumeCommands(items, 0);

    expect(first).toBe('openpawl -p "wire up the auth callback"');
    expect(first).not.toContain("run --headless");
  });

  it("prefers an item's explicit command when provided", () => {
    const items: LeftToDoItem[] = [
      {
        description: "rebuild dashboard",
        type: "open_task",
        priority: "medium",
        command: "bun run build",
      },
    ];

    expect(generateResumeCommands(items, 0)).toEqual(["bun run build"]);
  });
});
