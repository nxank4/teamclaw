import { describe, it, expect, beforeEach } from "bun:test";
import { setSettingValue } from "./settings.js";

describe("setSettingValue — prototype pollution (CodeQL #49)", () => {
  beforeEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted;
  });

  it("rejects __proto__ paths", () => {
    expect(() => setSettingValue("__proto__.polluted", "yes")).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects constructor.prototype paths", () => {
    expect(() => setSettingValue("constructor.prototype.polluted", "yes")).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects unknown keys outside the allowlist", () => {
    expect(() => setSettingValue("totally.invalid.key", "x")).toThrow();
  });
});
