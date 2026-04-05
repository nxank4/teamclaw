import { describe, it, expect } from "vitest";
import { ModeSystem } from "../../../src/tui/keybindings/mode-system.js";

describe("ModeSystem", () => {
  it("starts with default mode", () => {
    const ms = new ModeSystem();
    expect(ms.getMode()).toBe("default");
  });

  it("cycleNext goes default ��� auto-accept → plan-only → review-only → default", () => {
    const ms = new ModeSystem();
    expect(ms.cycleNext()).toBe("auto-accept");
    expect(ms.cycleNext()).toBe("plan-only");
    expect(ms.cycleNext()).toBe("review-only");
    expect(ms.cycleNext()).toBe("default");
  });

  it("cyclePrev goes in reverse", () => {
    const ms = new ModeSystem();
    expect(ms.cyclePrev()).toBe("review-only");
    expect(ms.cyclePrev()).toBe("plan-only");
    expect(ms.cyclePrev()).toBe("auto-accept");
    expect(ms.cyclePrev()).toBe("default");
  });

  it("setMode sets specific mode", () => {
    const ms = new ModeSystem();
    ms.setMode("plan-only");
    expect(ms.getMode()).toBe("plan-only");
  });

  it("getModeInfo returns correct display info for each mode", () => {
    const ms = new ModeSystem();
    const info = ms.getModeInfo();
    expect(info.mode).toBe("default");
    expect(info.shortName).toBe("DEF");
    expect(info.displayName).toBe("Default");

    ms.setMode("auto-accept");
    const autoInfo = ms.getModeInfo();
    expect(autoInfo.shortName).toBe("AUTO");
    expect(autoInfo.icon).toBe("⚡");
  });

  it("mode persists across calls (stateful)", () => {
    const ms = new ModeSystem();
    ms.setMode("review-only");
    expect(ms.getMode()).toBe("review-only");
    ms.cycleNext();
    expect(ms.getMode()).toBe("default");
  });

  it("respects enabledModes config", () => {
    const ms = new ModeSystem({ enabledModes: ["default", "plan-only"] });
    expect(ms.cycleNext()).toBe("plan-only");
    expect(ms.cycleNext()).toBe("default");
  });

  it("getAllModes returns info for enabled modes", () => {
    const ms = new ModeSystem();
    const modes = ms.getAllModes();
    expect(modes).toHaveLength(4);
    expect(modes[0]!.mode).toBe("default");
    expect(modes[3]!.mode).toBe("review-only");
  });
});
