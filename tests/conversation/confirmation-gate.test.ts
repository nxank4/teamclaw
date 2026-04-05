import { describe, it, expect } from "vitest";
import { ConfirmationGate } from "../../src/conversation/confirmation-gate.js";

describe("ConfirmationGate", () => {
  it("cost > $0.50 → confirmation needed", () => {
    const gate = new ConfirmationGate(0.50);
    const result = gate.shouldConfirm(
      { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false },
      { estimatedCost: 0.65, fileCount: 1, hasDestructive: false, isMultiAgent: false },
    );
    expect(result).not.toBeNull();
    expect(result!.risk).toBe("moderate");
  });

  it("cost < $0.10 → no confirmation", () => {
    const gate = new ConfirmationGate(0.50);
    const result = gate.shouldConfirm(
      { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false },
      { estimatedCost: 0.05, fileCount: 1, hasDestructive: false, isMultiAgent: false },
    );
    expect(result).toBeNull();
  });

  it("multi-agent with 3+ → confirmation", () => {
    const gate = new ConfirmationGate();
    const agents = [
      { agentId: "a", role: "A", task: "", tools: [], priority: 0 },
      { agentId: "b", role: "B", task: "", tools: [], priority: 1 },
      { agentId: "c", role: "C", task: "", tools: [], priority: 2 },
    ];
    const result = gate.shouldConfirm(
      { strategy: "orchestrated", agents, requiresConfirmation: false },
      { estimatedCost: 0.10, fileCount: 0, hasDestructive: false, isMultiAgent: true },
    );
    expect(result).not.toBeNull();
  });

  it("single agent simple → no confirmation", () => {
    const gate = new ConfirmationGate();
    const result = gate.shouldConfirm(
      { strategy: "single", agents: [{ agentId: "coder", role: "Coder", task: "", tools: [], priority: 0 }], requiresConfirmation: false },
      { estimatedCost: 0.02, fileCount: 1, hasDestructive: false, isMultiAgent: false },
    );
    expect(result).toBeNull();
  });
});
