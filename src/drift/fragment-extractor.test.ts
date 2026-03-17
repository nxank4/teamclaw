import { describe, it, expect } from "vitest";
import { extractGoalFragment } from "./fragment-extractor.js";

describe("extractGoalFragment", () => {
  it("returns max 10 words", () => {
    const goal = "Build a comprehensive Redis-based session caching system with automatic failover and health monitoring for production deployment";
    const fragment = extractGoalFragment(goal, ["redis", "session"]);
    const words = fragment.replace(/\.\.\.$/,"").trim().split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(10);
  });

  it("selects sentence with most tag overlap", () => {
    const goal = "Build the frontend. Add Redis-based session caching. Deploy to staging.";
    const fragment = extractGoalFragment(goal, ["redis", "session", "caching"]);
    expect(fragment.toLowerCase()).toContain("redis");
  });

  it("returns full short goal as-is", () => {
    const goal = "Add Redis caching";
    const fragment = extractGoalFragment(goal, ["redis"]);
    expect(fragment).toBe("Add Redis caching");
  });

  it("handles single-sentence goal", () => {
    const goal = "Use Redis for session storage";
    const fragment = extractGoalFragment(goal, ["redis", "session"]);
    expect(fragment).toContain("Redis");
  });

  it("handles empty tags gracefully", () => {
    const goal = "Build something cool";
    const fragment = extractGoalFragment(goal, []);
    expect(fragment.length).toBeGreaterThan(0);
  });

  it("handles empty goal gracefully", () => {
    const fragment = extractGoalFragment("", ["redis"]);
    expect(typeof fragment).toBe("string");
  });
});
