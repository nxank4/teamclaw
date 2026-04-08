import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/core/global-config.js", () => ({
  readGlobalConfigWithDefaults: vi.fn(() => ({
    version: 1,
    dashboardPort: 9001,
    debugMode: false,
    timeouts: { llm: 30000, health: 5000 },
  })),
  writeGlobalConfig: vi.fn(() => "/home/user/.openpawl/config.json"),
  readGlobalConfig: vi.fn(),
}));

describe("settings helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSettingValue reads dot-notation keys", async () => {
    const { getSettingValue } = await import("../../src/commands/settings.js");
    expect(getSettingValue("dashboardPort")).toBe(9001);
    expect(getSettingValue("timeouts.llm")).toBe(30000);
  });

  it("getSettingValue returns undefined for invalid keys", async () => {
    const { getSettingValue } = await import("../../src/commands/settings.js");
    expect(getSettingValue("nonexistent.key")).toBeUndefined();
  });

  it("setSettingValue writes dot-notation keys", async () => {
    const { writeGlobalConfig } = await import("../../src/core/global-config.js");
    const { setSettingValue } = await import("../../src/commands/settings.js");
    setSettingValue("dashboardPort", "8080");
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ dashboardPort: 8080 }),
    );
  });

  it("setSettingValue coerces booleans", async () => {
    const { writeGlobalConfig } = await import("../../src/core/global-config.js");
    const { setSettingValue } = await import("../../src/commands/settings.js");
    setSettingValue("debugMode", "true");
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ debugMode: true }),
    );
  });
});
