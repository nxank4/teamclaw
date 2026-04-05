import { describe, it, expect } from "vitest";
import { StreamAbortManager } from "../../src/streaming/abort-controller.js";

describe("StreamAbortManager", () => {
  it("session abort cancels all agent controllers", () => {
    const mgr = new StreamAbortManager();
    mgr.createForSession("s1");
    const agentA = mgr.createForAgent("s1", "coder");
    const agentB = mgr.createForAgent("s1", "reviewer");

    mgr.abortSession("s1");

    expect(agentA.signal.aborted).toBe(true);
    expect(agentB.signal.aborted).toBe(true);
  });

  it("agent abort cancels only that agent", () => {
    const mgr = new StreamAbortManager();
    mgr.createForSession("s1");
    const agentA = mgr.createForAgent("s1", "coder");
    const agentB = mgr.createForAgent("s1", "reviewer");

    mgr.abortAgent("s1", "coder");

    expect(agentA.signal.aborted).toBe(true);
    expect(agentB.signal.aborted).toBe(false);
  });

  it("cleanup removes all controllers for session", () => {
    const mgr = new StreamAbortManager();
    mgr.createForSession("s1");
    mgr.createForAgent("s1", "coder");

    mgr.cleanup("s1");

    expect(mgr.isAborted("s1")).toBe(false);
    expect(mgr.isAborted("s1", "coder")).toBe(false);
  });

  it("isAborted reflects correct state", () => {
    const mgr = new StreamAbortManager();
    mgr.createForSession("s1");

    expect(mgr.isAborted("s1")).toBe(false);
    mgr.abortSession("s1");
    expect(mgr.isAborted("s1")).toBe(true);
  });

  it("child controller aborts when parent aborts", () => {
    const mgr = new StreamAbortManager();
    mgr.createForSession("s1");
    const child = mgr.createForAgent("s1", "coder");

    expect(child.signal.aborted).toBe(false);
    mgr.abortSession("s1");
    expect(child.signal.aborted).toBe(true);
  });
});
