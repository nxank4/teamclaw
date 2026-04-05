import { describe, it, expect } from "vitest";
import { generateAgentCard } from "../../src/a2a/agent-card.js";
import type { AgentDefinition } from "../../src/router/router-types.js";

const agents: AgentDefinition[] = [
  { id: "coder", name: "Coder", description: "Writes code", capabilities: ["code_write"], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 3 },
  { id: "reviewer", name: "Reviewer", description: "Reviews code", capabilities: ["code_review"], defaultTools: [], modelTier: "primary", systemPrompt: "", canCollaborate: true, maxConcurrent: 2 },
];

describe("A2A Agent Card", () => {
  it("includes all agent skills", () => {
    const card = generateAgentCard(agents, { baseUrl: "http://localhost:4100", version: "1.0.0", authRequired: false });
    expect(card.skills).toHaveLength(2);
    expect(card.skills[0]!.id).toBe("coder");
    expect(card.skills[1]!.id).toBe("reviewer");
  });

  it("is valid JSON-serializable", () => {
    const card = generateAgentCard(agents, { baseUrl: "http://localhost:4100", version: "1.0.0", authRequired: true });
    const json = JSON.stringify(card);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes auth scheme when required", () => {
    const card = generateAgentCard(agents, { baseUrl: "http://localhost:4100", version: "1.0.0", authRequired: true });
    expect(card.authentication.schemes).toContain("bearer");
  });

  it("empty auth when not required", () => {
    const card = generateAgentCard(agents, { baseUrl: "http://localhost:4100", version: "1.0.0", authRequired: false });
    expect(card.authentication.schemes).toHaveLength(0);
  });
});
