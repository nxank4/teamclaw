import { describe, expect, it } from "bun:test";

import {
  normalizeGlobalConfig,
} from "../../src/core/global-config.js";

// NOTE: tests/core/provider-config.test.ts mocks buildDefaultGlobalConfig
// at the module level; the mock leaks across files in the Bun test
// runner, so we test the defaults via normalizeGlobalConfig (not
// mocked) rather than buildDefaultGlobalConfig directly.

describe("global-config — spec/plan keys", () => {
  it("normalizeGlobalConfig fills defaults when keys are missing (silent migration)", () => {
    const normalized = normalizeGlobalConfig({});
    expect(normalized.specsDirectory).toBe("./specs");
    expect(normalized.plansDirectory).toBe("./plans");
    expect(normalized.complexityThreshold).toEqual({ tokens: 100, fileMentions: 2 });
  });

  it("normalizeGlobalConfig honours overrides", () => {
    const normalized = normalizeGlobalConfig({
      specsDirectory: "./design/specs",
      plansDirectory: "./design/plans",
      complexityThreshold: { tokens: 200, fileMentions: 5 },
    });
    expect(normalized.specsDirectory).toBe("./design/specs");
    expect(normalized.plansDirectory).toBe("./design/plans");
    expect(normalized.complexityThreshold).toEqual({ tokens: 200, fileMentions: 5 });
  });

  it("normalizeGlobalConfig falls back to defaults for malformed inputs", () => {
    // @ts-expect-error — deliberately invalid for the test
    const normalized = normalizeGlobalConfig({ specsDirectory: 0, complexityThreshold: "nonsense" });
    expect(normalized.specsDirectory).toBe("./specs");
    expect(normalized.complexityThreshold.tokens).toBe(100);
  });
});
