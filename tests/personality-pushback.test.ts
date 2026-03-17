import { describe, it, expect } from "vitest";
import { detectPushback } from "../src/personality/pushback.js";

describe("detectPushback", () => {
  describe("tech-lead triggers", () => {
    it("triggers on 'for now'", () => {
      const result = detectPushback("I'll fix it for now and move on", "tech-lead");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("warn");
      expect(result.response).toBeTruthy();
    });

    it("triggers on 'quick fix' with block severity", () => {
      const result = detectPushback("Let me apply a quick fix here", "tech-lead");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("block");
    });

    it("triggers on 'just hardcode' with block severity", () => {
      const result = detectPushback("Let's just hardcode the values", "tech-lead");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("block");
    });

    it("does not trigger on clean implementation", () => {
      const result = detectPushback(
        "Clean implementation with proper abstractions and comprehensive tests",
        "tech-lead",
      );
      expect(result.triggered).toBe(false);
    });
  });

  describe("qa-reviewer triggers", () => {
    it("triggers on 'no tests needed'", () => {
      const result = detectPushback("no tests needed for this change", "qa-reviewer");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("block");
    });

    it("triggers on 'it's simple enough'", () => {
      const result = detectPushback("it's simple enough, don't worry", "qa-reviewer");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("warn");
    });
  });

  describe("unknown role", () => {
    it("does not trigger for unknown role", () => {
      const result = detectPushback("quick fix for now", "unknown-agent");
      expect(result.triggered).toBe(false);
    });
  });

  describe("severity ranking", () => {
    it("takes worst severity when multiple triggers match", () => {
      // "quick fix" (block) + "for now" (warn) should yield block
      const result = detectPushback("Just apply a quick fix for now", "tech-lead");
      expect(result.triggered).toBe(true);
      expect(result.severity).toBe("block");
      expect(result.triggers.length).toBeGreaterThan(1);
    });
  });

  describe("agentRole in result", () => {
    it("includes the reviewer role", () => {
      const result = detectPushback("anything", "tech-lead");
      expect(result.agentRole).toBe("tech-lead");
    });
  });
});
