import { describe, it, expect } from "vitest";
import {
  ContextTracker,
  estimateTokens,
  estimateMessageTokens,
} from "../../src/context/context-tracker.js";

describe("estimateTokens", () => {
  it("estimates English text within 15% of actual", () => {
    // "The quick brown fox jumps over the lazy dog" = 9 words ≈ 10 tokens
    // 44 chars / 4 = 11 — within 15% of ~10
    const text = "The quick brown fox jumps over the lazy dog";
    const est = estimateTokens(text);
    expect(est).toBeGreaterThan(8);
    expect(est).toBeLessThan(14);
  });

  it("estimates code reasonably", () => {
    const code = 'export function hello(name: string): string {\n  return `Hello, ${name}!`;\n}';
    const est = estimateTokens(code);
    // 77 chars / 4 ≈ 20 tokens
    expect(est).toBeGreaterThan(10);
    expect(est).toBeLessThan(30);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("estimateMessageTokens", () => {
  it("sums tokens across messages", () => {
    const messages = [
      { content: "hello" },     // 5 chars → 2 tokens
      { content: "world foo" }, // 9 chars → 3 tokens
    ];
    const est = estimateMessageTokens(messages);
    expect(est).toBe(5);
  });

  it("handles empty array", () => {
    expect(estimateMessageTokens([])).toBe(0);
  });
});

describe("ContextTracker", () => {
  describe("snapshot", () => {
    it("reports correct utilization percentage", () => {
      const tracker = new ContextTracker(1000);
      // 2000 chars = ~500 tokens → 50% of 1000
      const messages = [{ content: "x".repeat(2000) }];
      const snap = tracker.snapshot(messages);

      expect(snap.estimatedTokens).toBe(500);
      expect(snap.maxTokens).toBe(1000);
      expect(snap.utilizationPercent).toBe(50);
      expect(snap.level).toBe("normal");
    });

    it("level is normal below 70%", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(2760) }]; // 690 tokens = 69%
      expect(tracker.snapshot(messages).level).toBe("normal");
    });

    it("level is warning at 70-79%", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(3000) }]; // 750 tokens = 75%
      expect(tracker.snapshot(messages).level).toBe("warning");
    });

    it("level is high at 80-84%", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(3280) }]; // 820 tokens = 82%
      expect(tracker.snapshot(messages).level).toBe("high");
    });

    it("level is critical at 85-98%", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(3600) }]; // 900 tokens = 90%
      expect(tracker.snapshot(messages).level).toBe("critical");
    });

    it("level is emergency at 99%+", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(4000) }]; // 1000 tokens = 100%
      expect(tracker.snapshot(messages).level).toBe("emergency");
    });
  });

  describe("shouldCompact", () => {
    it("returns false for normal and warning", () => {
      const tracker = new ContextTracker(1000);
      expect(tracker.shouldCompact({ estimatedTokens: 500, maxTokens: 1000, utilizationPercent: 50, level: "normal" })).toBe(false);
      expect(tracker.shouldCompact({ estimatedTokens: 750, maxTokens: 1000, utilizationPercent: 75, level: "warning" })).toBe(false);
    });

    it("returns true for high, critical, emergency", () => {
      const tracker = new ContextTracker(1000);
      expect(tracker.shouldCompact({ estimatedTokens: 820, maxTokens: 1000, utilizationPercent: 82, level: "high" })).toBe(true);
      expect(tracker.shouldCompact({ estimatedTokens: 900, maxTokens: 1000, utilizationPercent: 90, level: "critical" })).toBe(true);
      expect(tracker.shouldCompact({ estimatedTokens: 990, maxTokens: 1000, utilizationPercent: 99, level: "emergency" })).toBe(true);
    });
  });

  describe("boundary tests", () => {
    it("69% is normal, 70% is warning", () => {
      const tracker = new ContextTracker(100);
      // 276 chars = 69 tokens → 69%
      expect(tracker.snapshot([{ content: "x".repeat(276) }]).level).toBe("normal");
      // 280 chars = 70 tokens → 70%
      expect(tracker.snapshot([{ content: "x".repeat(280) }]).level).toBe("warning");
    });

    it("79% is warning, 80% is high", () => {
      const tracker = new ContextTracker(100);
      expect(tracker.snapshot([{ content: "x".repeat(316) }]).level).toBe("warning"); // 79
      expect(tracker.snapshot([{ content: "x".repeat(320) }]).level).toBe("high");    // 80
    });

    it("84% is high, 85% is critical", () => {
      const tracker = new ContextTracker(100);
      expect(tracker.snapshot([{ content: "x".repeat(336) }]).level).toBe("high");     // 84
      expect(tracker.snapshot([{ content: "x".repeat(340) }]).level).toBe("critical"); // 85
    });
  });

  describe("setMaxTokens", () => {
    it("updates the max context tokens", () => {
      const tracker = new ContextTracker(1000);
      const messages = [{ content: "x".repeat(3600) }]; // 900 tokens

      expect(tracker.snapshot(messages).utilizationPercent).toBe(90);

      tracker.setMaxTokens(2000);
      expect(tracker.snapshot(messages).utilizationPercent).toBe(45);
    });
  });
});
