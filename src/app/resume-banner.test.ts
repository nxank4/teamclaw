import { describe, it, expect } from "bun:test";
import { buildResumeBannerContent } from "./resume-banner.js";
import { stripAnsi } from "../tui/utils/text-width.js";
import type { Session } from "../session/session.js";

function fakeSession(opts: { title: string; messageCount: number; updatedAt: string }): Session {
  return {
    messageCount: opts.messageCount,
    getState: () => ({ title: opts.title, updatedAt: opts.updatedAt }),
  } as unknown as Session;
}

describe("buildResumeBannerContent", () => {
  it("includes title, message count, and relative time", () => {
    const out = stripAnsi(buildResumeBannerContent(
      fakeSession({ title: "alpha", messageCount: 42, updatedAt: new Date().toISOString() }),
    ));
    expect(out).toContain("Resuming session:");
    expect(out).toContain("alpha");
    expect(out).toContain("42 messages");
    expect(out).toContain("just now");
  });

  it("renders 'X ago' for older sessions", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const out = stripAnsi(buildResumeBannerContent(
      fakeSession({ title: "alpha", messageCount: 5, updatedAt: twoHoursAgo }),
    ));
    expect(out).toContain("2h ago");
  });

  it("truncates titles longer than 40 chars with an ellipsis", () => {
    const long = "x".repeat(60);
    const out = stripAnsi(buildResumeBannerContent(
      fakeSession({ title: long, messageCount: 1, updatedAt: new Date().toISOString() }),
    ));
    expect(out).toContain("…");
    expect(out).toMatch(/x{39}…/);
  });

  it("does NOT truncate exactly-40-char titles", () => {
    const exact = "x".repeat(40);
    const out = stripAnsi(buildResumeBannerContent(
      fakeSession({ title: exact, messageCount: 1, updatedAt: new Date().toISOString() }),
    ));
    expect(out).not.toContain("…");
    expect(out).toContain(exact);
  });

  it("formats with separator ' · '", () => {
    const out = stripAnsi(buildResumeBannerContent(
      fakeSession({ title: "alpha", messageCount: 3, updatedAt: new Date().toISOString() }),
    ));
    expect(out).toMatch(/alpha · 3 messages · /);
  });
});
