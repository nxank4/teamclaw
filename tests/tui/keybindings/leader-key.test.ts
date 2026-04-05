import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LeaderKeyHandler } from "../../../src/tui/keybindings/leader-key.js";

describe("LeaderKeyHandler", () => {
  let leader: LeaderKeyHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    leader = new LeaderKeyHandler({ leader: "ctrl+x", timeoutMs: 2000 });
    leader.register("n", "session:new", vi.fn(), "New session");
    leader.register("m", "model:list", vi.fn(), "List models");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Ctrl+X sets awaiting state", () => {
    const result = leader.handleKey("ctrl+x");
    expect(result).toEqual({ consumed: true, waiting: true });
    expect(leader.isAwaitingSecondKey()).toBe(true);
  });

  it("Ctrl+X then 'n' triggers session_new", () => {
    leader.handleKey("ctrl+x");
    const result = leader.handleKey("n");
    expect(result).toEqual({ consumed: true, action: "session:new" });
    expect(leader.isAwaitingSecondKey()).toBe(false);
  });

  it("Ctrl+X then unknown key shows error", () => {
    const feedback = vi.fn();
    leader.onFeedback = feedback;
    leader.handleKey("ctrl+x");
    const result = leader.handleKey("z");
    expect(result).toEqual({ consumed: true, action: "leader:unknown" });
    expect(feedback).toHaveBeenCalledWith("Unknown: ctrl+x z");
  });

  it("timeout (2s) cancels leader state", () => {
    const feedback = vi.fn();
    leader.onFeedback = feedback;
    leader.handleKey("ctrl+x");
    expect(leader.isAwaitingSecondKey()).toBe(true);

    vi.advanceTimersByTime(2001);
    expect(leader.isAwaitingSecondKey()).toBe(false);
    expect(feedback).toHaveBeenCalledWith("Leader key timed out");
  });

  it("Escape cancels leader state", () => {
    leader.handleKey("ctrl+x");
    const result = leader.handleKey("escape");
    expect(result).toEqual({ consumed: true, action: "leader:cancel" });
    expect(leader.isAwaitingSecondKey()).toBe(false);
  });

  it("double Ctrl+X opens command palette", () => {
    const palette = vi.fn();
    leader.onPalette = palette;
    leader.handleKey("ctrl+x");
    const result = leader.handleKey("ctrl+x");
    expect(result).toEqual({ consumed: true, action: "palette:show" });
    expect(palette).toHaveBeenCalledOnce();
  });

  it("register adds new binding", () => {
    leader.register("t", "theme:list", vi.fn(), "List themes");
    leader.handleKey("ctrl+x");
    const result = leader.handleKey("t");
    expect(result).toEqual({ consumed: true, action: "theme:list" });
  });

  it("non-leader key is not consumed", () => {
    const result = leader.handleKey("a");
    expect(result).toEqual({ consumed: false });
  });

  it("getBindings returns all registered bindings", () => {
    expect(leader.getBindings()).toHaveLength(2);
  });
});
