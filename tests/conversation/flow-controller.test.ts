import { describe, it, expect } from "vitest";
import { FlowController } from "../../src/conversation/flow-controller.js";
import type { RouteDecision } from "../../src/router/router-types.js";

describe("FlowController", () => {
  const controller = new FlowController(0.50);

  it("ambiguous prompt → returns clarify", async () => {
    const decision: RouteDecision = { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false };
    const result = await controller.preExecutionCheck("fix it", decision, { trackedFiles: [] });
    expect(result.type).toBe("clarify");
  });

  it("expensive plan → returns confirm", async () => {
    const decision: RouteDecision = { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false };
    const result = await controller.preExecutionCheck("build a REST API", decision, { estimatedCost: 1.50 });
    expect(result.type).toBe("confirm");
  });

  it("simple clear prompt → returns proceed", async () => {
    const decision: RouteDecision = { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false };
    const result = await controller.preExecutionCheck("write a function that adds two numbers in src/math.ts", decision, { estimatedCost: 0.02 });
    expect(result.type).toBe("proceed");
  });

  it("complex plan → returns confirm or preview for multi-agent", async () => {
    const agents = [
      { agentId: "planner", role: "Planner", task: "plan", tools: [], priority: 0 },
      { agentId: "coder", role: "Coder", task: "code", tools: ["file_write"], priority: 1 },
      { agentId: "tester", role: "Tester", task: "test", tools: ["shell_exec"], priority: 2 },
    ];
    const decision: RouteDecision = { strategy: "orchestrated", agents, requiresConfirmation: false };
    const result = await controller.preExecutionCheck("build full auth system with tests", decision, { estimatedCost: 0.10 });
    // Multi-agent → confirm gate triggers before preview
    expect(result.type === "confirm" || result.type === "preview").toBe(true);
  });
});
