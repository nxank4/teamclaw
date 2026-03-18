import { describe, it, expect } from "vitest";
import {
  PERSONALITY_PROFILES,
  NEUTRAL_PERSONALITY,
  getPersonality,
} from "@/personality/profiles.js";

describe("PERSONALITY_PROFILES", () => {
  it("has all 5 expected profiles", () => {
    expect(Object.keys(PERSONALITY_PROFILES)).toEqual(
      expect.arrayContaining(["tech-lead", "rfc-author", "coordinator", "qa-reviewer", "sprint-planner"]),
    );
    expect(Object.keys(PERSONALITY_PROFILES)).toHaveLength(5);
  });

  it("tech-lead has expected pushback triggers", () => {
    const tl = PERSONALITY_PROFILES["tech-lead"];
    const patterns = tl.pushbackTriggers.map((t) => t.pattern);
    expect(patterns).toContain("for now");
    expect(patterns).toContain("temporary");
    expect(patterns).toContain("quick fix");
    expect(patterns).toContain("just hardcode");
  });

  it("rfc-author has thorough trait and usesQuestions", () => {
    const rfc = PERSONALITY_PROFILES["rfc-author"];
    expect(rfc.traits).toContain("thorough");
    expect(rfc.communicationStyle.usesQuestions).toBe(true);
  });

  it("all profiles have non-empty catchphrases", () => {
    for (const [role, profile] of Object.entries(PERSONALITY_PROFILES)) {
      expect(profile.catchphrases.length, `${role} should have catchphrases`).toBeGreaterThan(0);
    }
  });

  it("all profiles have non-empty traits", () => {
    for (const [role, profile] of Object.entries(PERSONALITY_PROFILES)) {
      expect(profile.traits.length, `${role} should have traits`).toBeGreaterThan(0);
    }
  });
});

describe("NEUTRAL_PERSONALITY", () => {
  it("has empty arrays for traits, opinions, triggers, catchphrases", () => {
    expect(NEUTRAL_PERSONALITY.traits).toEqual([]);
    expect(NEUTRAL_PERSONALITY.opinions).toEqual([]);
    expect(NEUTRAL_PERSONALITY.pushbackTriggers).toEqual([]);
    expect(NEUTRAL_PERSONALITY.catchphrases).toEqual([]);
  });

  it("has role set to neutral", () => {
    expect(NEUTRAL_PERSONALITY.role).toBe("neutral");
  });
});

describe("getPersonality", () => {
  it("returns profile for known roles", () => {
    expect(getPersonality("tech-lead").role).toBe("tech-lead");
    expect(getPersonality("coordinator").role).toBe("coordinator");
  });

  it("returns NEUTRAL_PERSONALITY for unknown roles", () => {
    expect(getPersonality("unknown")).toBe(NEUTRAL_PERSONALITY);
    expect(getPersonality("")).toBe(NEUTRAL_PERSONALITY);
  });
});
