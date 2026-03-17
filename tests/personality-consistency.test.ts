import { describe, it, expect } from "vitest";
import { enforcePersonalityConsistency } from "../src/personality/consistency.js";

describe("enforcePersonalityConsistency", () => {
  describe("tech-lead", () => {
    it("appends firmness when output has excessive hedging", () => {
      const hedgy = "We might consider this. Perhaps we could potentially do something. Maybe we should think about it more.";
      const result = enforcePersonalityConsistency(hedgy, "tech-lead");
      expect(result).not.toBe(hedgy);
      expect(result).toContain("To be direct:");
    });

    it("leaves firm output unchanged", () => {
      const firm = "We need to implement proper error handling. The current approach is inadequate.";
      const result = enforcePersonalityConsistency(firm, "tech-lead");
      expect(result).toBe(firm);
    });
  });

  describe("rfc-author", () => {
    it("appends question when output has no questions", () => {
      const noQuestion = "The system should use a microservices architecture.";
      const result = enforcePersonalityConsistency(noQuestion, "rfc-author");
      expect(result).not.toBe(noQuestion);
      expect(result).toContain("Before proceeding:");
    });

    it("leaves output with questions unchanged", () => {
      const withQ = "Have we considered the failure modes? The system seems fragile.";
      const result = enforcePersonalityConsistency(withQ, "rfc-author");
      expect(result).toBe(withQ);
    });
  });

  describe("coordinator", () => {
    it("appends conclusion when output lacks conclusive language", () => {
      const indecisive = "There are several options we could explore here.";
      const result = enforcePersonalityConsistency(indecisive, "coordinator");
      expect(result).not.toBe(indecisive);
      expect(result.length).toBeGreaterThan(indecisive.length);
    });

    it("leaves decisive output unchanged", () => {
      const decisive = "I've decided we are moving forward with option A.";
      const result = enforcePersonalityConsistency(decisive, "coordinator");
      expect(result).toBe(decisive);
    });
  });

  describe("qa-reviewer", () => {
    it("appends data request when output lacks data references", () => {
      const noData = "This implementation looks solid and well-structured.";
      const result = enforcePersonalityConsistency(noData, "qa-reviewer");
      expect(result).not.toBe(noData);
    });

    it("leaves output with test references unchanged", () => {
      const withData = "The test coverage shows 90% confidence in this approach.";
      const result = enforcePersonalityConsistency(withData, "qa-reviewer");
      expect(result).toBe(withData);
    });
  });

  describe("unknown role", () => {
    it("returns output unchanged", () => {
      const output = "Some generic output without any structure.";
      const result = enforcePersonalityConsistency(output, "unknown-agent");
      expect(result).toBe(output);
    });
  });
});
