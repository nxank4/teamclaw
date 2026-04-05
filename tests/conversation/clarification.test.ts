import { describe, it, expect } from "vitest";
import { ClarificationDetector } from "../../src/conversation/clarification.js";

describe("ClarificationDetector", () => {
  const detector = new ClarificationDetector();

  it('"fix it" → clarification needed', () => {
    const result = detector.detect("fix it", {});
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("ask");
  });

  it('"fix src/auth.ts line 42" → no clarification', () => {
    const result = detector.detect("fix src/auth.ts line 42", {});
    expect(result).toBeNull();
  });

  it('"explain the router" → no clarification', () => {
    const result = detector.detect("explain the router", {});
    expect(result).toBeNull();
  });

  it('"delete everything" → clarification needed', () => {
    const result = detector.detect("delete everything old", {});
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("ask");
  });

  it("returns max 3 questions", () => {
    const result = detector.detect("fix it", {});
    expect(result!.questions.length).toBeLessThanOrEqual(3);
  });

  it("@coder mention skips clarification", () => {
    const result = detector.detect("@coder fix it", {});
    expect(result).toBeNull();
  });
});
