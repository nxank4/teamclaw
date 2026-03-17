import { describe, it, expect } from "vitest";
import { parseContextMarkdown, isDuplicateDecision } from "../src/handoff/importer.js";

const SAMPLE_CONTEXT = `# TeamClaw Project Context
**Generated:** 2026-03-17 14:32:00 UTC
**Session:** sess_abc123
**Project:** /home/user/myapp

---

## Where We Are
Goal: "Refactor auth module"
Status: \u2705 Complete

Current project state:
- OAuth2 with PKCE flow implemented
- Token refresh logic added

---

## Active Decisions
These decisions are in effect \u2014 honor them in future sessions:

1. **Use PKCE flow for OAuth2** (tech_lead, high confidence)
   Reasoning: "Implicit flow exposes tokens in URL fragments"

2. **Avoid Redis for session storage** (rfc_author, high confidence)
   Reasoning: "Stateless JWT chosen for scalability"

---

## Left To Do
These items are ready to pick up in the next session:

- [ ] Execute caching layer RFC \u2014 approved, not started
- [ ] Add rate limiting \u2014 deferred

---

## What The Team Learned
Lessons from this session (added to global memory):

- PKCE flow preferred over implicit for SPA auth

---

## Team Performance
- Worker Bot: improving (+0.08 this week) \u2014 strong on implementation

---

## How To Resume
`;

describe("parseContextMarkdown", () => {
  it("extracts current state bullets", () => {
    const parsed = parseContextMarkdown(SAMPLE_CONTEXT);
    expect(parsed.currentState).toContain("OAuth2 with PKCE flow implemented");
    expect(parsed.currentState).toContain("Token refresh logic added");
  });

  it("extracts active decisions", () => {
    const parsed = parseContextMarkdown(SAMPLE_CONTEXT);
    expect(parsed.decisions).toHaveLength(2);
    expect(parsed.decisions[0].decision).toBe("Use PKCE flow for OAuth2");
    expect(parsed.decisions[0].reasoning).toBe("Implicit flow exposes tokens in URL fragments");
  });

  it("extracts left-to-do items", () => {
    const parsed = parseContextMarkdown(SAMPLE_CONTEXT);
    expect(parsed.leftToDo).toHaveLength(2);
    expect(parsed.leftToDo[0]).toContain("Execute caching layer RFC");
    expect(parsed.leftToDo[1]).toContain("Add rate limiting");
  });

  it("does NOT extract team performance (always empty)", () => {
    const parsed = parseContextMarkdown(SAMPLE_CONTEXT);
    expect(parsed.teamPerformance).toEqual([]);
  });

  it("works on minimal CONTEXT.md with only header", () => {
    const minimal = `# TeamClaw Project Context
**Generated:** 2026-03-17 14:32:00 UTC
**Session:** sess_min
**Project:** /tmp/test
`;
    const parsed = parseContextMarkdown(minimal);
    expect(parsed.sessionId).toBe("sess_min");
    expect(parsed.projectPath).toBe("/tmp/test");
    expect(parsed.currentState).toEqual([]);
    expect(parsed.decisions).toEqual([]);
    expect(parsed.leftToDo).toEqual([]);
  });

  it("handles missing sections gracefully", () => {
    const partial = `# TeamClaw Project Context
**Generated:** 2026-03-17 14:32:00 UTC
**Session:** sess_partial
**Project:** /tmp/partial

---

## Where We Are
Goal: "Test"
Status: \u2705 Complete

Current project state:
- Something done
`;
    const parsed = parseContextMarkdown(partial);
    expect(parsed.sessionId).toBe("sess_partial");
    expect(parsed.currentState).toEqual(["Something done"]);
    expect(parsed.decisions).toEqual([]);
    expect(parsed.leftToDo).toEqual([]);
  });
});

describe("isDuplicateDecision", () => {
  it("returns true for exact match", () => {
    expect(
      isDuplicateDecision("Use JWT for auth", [{ decision: "Use JWT for auth" }]),
    ).toBe(true);
  });

  it("returns true for substring match", () => {
    expect(
      isDuplicateDecision("Use JWT", [{ decision: "Use JWT for auth tokens" }]),
    ).toBe(true);
  });

  it("returns false for different decisions", () => {
    expect(
      isDuplicateDecision("Use Redis", [{ decision: "Use PostgreSQL" }]),
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(
      isDuplicateDecision("use jwt", [{ decision: "Use JWT for Auth" }]),
    ).toBe(true);
  });
});
