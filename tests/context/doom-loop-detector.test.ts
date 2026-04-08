import { describe, it, expect, beforeEach } from "vitest";
import { DoomLoopDetector } from "../../src/context/doom-loop-detector.js";

describe("DoomLoopDetector", () => {
  let detector: DoomLoopDetector;

  beforeEach(() => {
    detector = new DoomLoopDetector();
  });

  describe("fingerprint", () => {
    it("produces consistent hash for same tool + params", () => {
      const a = detector.fingerprint("file_read", { path: "/a.ts" });
      const b = detector.fingerprint("file_read", { path: "/a.ts" });
      expect(a).toBe(b);
    });

    it("produces same hash regardless of key order", () => {
      const a = detector.fingerprint("search", { query: "foo", path: "/src" });
      const b = detector.fingerprint("search", { path: "/src", query: "foo" });
      expect(a).toBe(b);
    });

    it("different params produce different hashes", () => {
      const a = detector.fingerprint("file_read", { path: "/a.ts" });
      const b = detector.fingerprint("file_read", { path: "/b.ts" });
      expect(a).not.toBe(b);
    });

    it("different tools with same params produce different hashes", () => {
      const a = detector.fingerprint("file_read", { path: "/a.ts" });
      const b = detector.fingerprint("file_write", { path: "/a.ts" });
      expect(a).not.toBe(b);
    });
  });

  describe("track", () => {
    const agent = "coder";
    const tool = "file_read";
    const params = { path: "/src/missing.ts" };

    it("1st call returns allow", () => {
      const v = detector.track(agent, tool, params);
      expect(v.action).toBe("allow");
    });

    it("2nd identical call returns allow", () => {
      detector.track(agent, tool, params);
      const v = detector.track(agent, tool, params);
      expect(v.action).toBe("allow");
    });

    it("3rd identical call returns warn", () => {
      detector.track(agent, tool, params);
      detector.track(agent, tool, params);
      const v = detector.track(agent, tool, params);
      expect(v.action).toBe("warn");
      expect(v).toHaveProperty("count", 3);
      expect(v).toHaveProperty("message");
      expect((v as { message: string }).message).toContain("file_read");
    });

    it("4th identical call returns block", () => {
      for (let i = 0; i < 3; i++) detector.track(agent, tool, params);
      const v = detector.track(agent, tool, params);
      expect(v.action).toBe("block");
      expect(v).toHaveProperty("count", 4);
      expect((v as { message: string }).message).toContain("blocked");
    });

    it("different params resets the consecutive count", () => {
      detector.track(agent, tool, params);
      detector.track(agent, tool, params);
      // Different param breaks the chain
      detector.track(agent, tool, { path: "/other.ts" });
      // Back to original — should be 1st consecutive
      const v = detector.track(agent, tool, params);
      expect(v.action).toBe("allow");
    });

    it("same tool different params = no loop", () => {
      detector.track(agent, tool, { path: "/a.ts" });
      detector.track(agent, tool, { path: "/b.ts" });
      detector.track(agent, tool, { path: "/c.ts" });
      const v = detector.track(agent, tool, { path: "/d.ts" });
      expect(v.action).toBe("allow");
    });

    it("different agents have independent windows", () => {
      for (let i = 0; i < 3; i++) detector.track("agent-a", tool, params);
      // agent-b should start fresh
      const v = detector.track("agent-b", tool, params);
      expect(v.action).toBe("allow");
    });
  });

  describe("sliding window", () => {
    it("evicts after 20 calls", () => {
      const agent = "coder";
      // 2 identical calls
      detector.track(agent, "file_read", { path: "/x.ts" });
      detector.track(agent, "file_read", { path: "/x.ts" });

      // 20 different calls to push out the first 2
      for (let i = 0; i < 20; i++) {
        detector.track(agent, "other_tool", { i });
      }

      // Now the original calls are evicted — this should be a fresh 1st call
      const v = detector.track(agent, "file_read", { path: "/x.ts" });
      expect(v.action).toBe("allow");
    });
  });

  describe("reset", () => {
    it("clears state for a specific agent", () => {
      const agent = "coder";
      detector.track(agent, "file_read", { path: "/x.ts" });
      detector.track(agent, "file_read", { path: "/x.ts" });
      detector.reset(agent);

      // Should be fresh — 1st call
      const v = detector.track(agent, "file_read", { path: "/x.ts" });
      expect(v.action).toBe("allow");
    });

    it("clears all state when no agent specified", () => {
      detector.track("a", "t", { x: 1 });
      detector.track("b", "t", { x: 1 });
      detector.reset();

      expect(detector.getStats().totalCalls).toBe(0);
    });
  });

  describe("getStats", () => {
    it("reports correct counts", () => {
      detector.track("a", "t1", { x: 1 });
      detector.track("a", "t1", { x: 1 });
      detector.track("b", "t2", { y: 2 });

      const stats = detector.getStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.uniqueFingerprints).toBe(2);
      expect(stats.agents).toBe(2);
    });
  });
});
