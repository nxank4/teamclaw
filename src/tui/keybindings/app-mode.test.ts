import { describe, expect, it } from "bun:test";
import { AppModeSystem, parseAppMode } from "./app-mode.js";

describe("parseAppMode", () => {
  it("accepts 'solo' and 'crew'", () => {
    expect(parseAppMode("solo")).toBe("solo");
    expect(parseAppMode("crew")).toBe("crew");
  });

  it("returns null for invalid values", () => {
    expect(parseAppMode("sprint")).toBeNull();
    expect(parseAppMode("collab")).toBeNull();
    expect(parseAppMode("")).toBeNull();
    expect(parseAppMode(undefined)).toBeNull();
  });

  it("is case-sensitive", () => {
    expect(parseAppMode("Solo")).toBeNull();
    expect(parseAppMode("CREW")).toBeNull();
  });
});

describe("AppModeSystem constructor", () => {
  it("defaults to solo when initialMode is omitted", () => {
    const sys = new AppModeSystem();
    expect(sys.getMode()).toBe("solo");
  });

  it("defaults to solo when initialMode is undefined", () => {
    const sys = new AppModeSystem(undefined);
    expect(sys.getMode()).toBe("solo");
  });

  it("respects initialMode='crew'", () => {
    const sys = new AppModeSystem("crew");
    expect(sys.getMode()).toBe("crew");
  });

  it("respects initialMode='solo' explicitly", () => {
    const sys = new AppModeSystem("solo");
    expect(sys.getMode()).toBe("solo");
  });

  it("cycleNext from crew goes back to solo (regression)", () => {
    const sys = new AppModeSystem("crew");
    sys.cycleNext();
    expect(sys.getMode()).toBe("solo");
  });

  it("setMode still works after initialMode override", () => {
    const sys = new AppModeSystem("crew");
    sys.setMode("solo");
    expect(sys.getMode()).toBe("solo");
  });
});
