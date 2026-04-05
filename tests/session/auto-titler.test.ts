import { describe, it, expect } from "vitest";
import { AutoTitler } from "../../src/session/auto-titler.js";

describe("AutoTitler", () => {
  const titler = new AutoTitler();

  it("generates short title from short message", async () => {
    expect(await titler.generateTitle("Fix auth bug")).toBe("Fix auth bug");
  });

  it("falls back to first 50 chars for long message", async () => {
    const long = "Implement a comprehensive user authentication system with JWT tokens, refresh tokens, and role-based access control";
    const title = await titler.generateTitle(long);
    expect(title.length).toBeLessThanOrEqual(54); // 50 + "..."
  });

  it("strips 'Help me' prefix", async () => {
    const title = await titler.generateTitle("Help me fix the login bug");
    expect(title).not.toMatch(/^help me/i);
    expect(title).toContain("fix");
  });

  it("strips 'Please' prefix", async () => {
    const title = await titler.generateTitle("Please write a test for auth");
    expect(title).not.toMatch(/^please/i);
  });
});
