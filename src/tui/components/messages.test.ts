import { describe, expect, it } from "bun:test";

import { MessagesComponent } from "./messages.js";
import { stripAnsi } from "../utils/text-width.js";

describe("MessagesComponent.replaceLastByTag", () => {
  it("replaces the last message when its tag matches", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "agent", content: "spinner-frame-1", tag: "thinking" });
    expect(m.replaceLastByTag("thinking", "spinner-frame-2")).toBe(true);
  });

  it("does not replace when the last message has a different tag", () => {
    // Regression: the thinking indicator's 150ms tick used to call
    // replaceLast() unconditionally, clobbering tool-approval prompts
    // pushed onto the message stream during a crew run. The tag-aware
    // variant must skip when the tag doesn't match so the prompt
    // remains visible until the user resolves it.
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "agent", content: "spinner", tag: "thinking" });
    m.addMessage({ role: "system", content: "shell_exec [Y/N]", tag: "tool-approval" });
    expect(m.replaceLastByTag("thinking", "next-spinner-frame")).toBe(false);
  });

  it("does not replace when the last message is untagged", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "user", content: "hello" });
    expect(m.replaceLastByTag("thinking", "spinner")).toBe(false);
  });

  it("returns false when there are no messages", () => {
    const m = new MessagesComponent("test-messages");
    expect(m.replaceLastByTag("thinking", "anything")).toBe(false);
  });
});

/**
 * Bug U+3 — when the crew runtime pushes a system message below the
 * thinking placeholder (e.g. \"-> auto-advancing to next phase.\", a
 * pause banner, a reanchor prompt), the live tool tree must remain
 * attached to the thinking-tagged agent message instead of disappearing
 * because the agent is no longer the globally-last entry.
 */
describe("MessagesComponent — live tool tree across phase boundaries", () => {
  function renderedText(m: MessagesComponent, width = 80): string {
    return m.render(width).map(stripAnsi).join("\n");
  }

  it("keeps the progress tree under the agent when a system message is appended below", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "user", content: "build hello.ts" });
    m.addMessage({
      role: "agent",
      agentName: "OpenPawl",
      content: "",
      tag: "thinking",
    });
    m.startToolCall("exec-1", "file_read", "Read hello.ts", "coder");
    m.completeToolCall("exec-1", true, "ok", 12);

    const before = renderedText(m);
    expect(before).toContain("Read hello.ts");

    m.addMessage({ role: "system", content: "-> auto-advancing to next phase." });

    const after = renderedText(m);
    expect(after).toContain("Read hello.ts");
    expect(after).toContain("auto-advancing to next phase.");
    // Tree must still appear above the auto-advance line, not be replaced
    // by it.
    expect(after.indexOf("Read hello.ts")).toBeLessThan(
      after.indexOf("auto-advancing"),
    );
  });

  it("renders newly-started tools under the same agent when a system row already sits below it", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "user", content: "build hello.ts" });
    m.addMessage({
      role: "agent",
      agentName: "OpenPawl",
      content: "",
      tag: "thinking",
    });
    m.startToolCall("exec-1", "file_read", "Read hello.ts", "coder");
    m.completeToolCall("exec-1", true, "ok", 12);
    m.addMessage({ role: "system", content: "-> auto-advancing to next phase." });
    // Phase 2 begins — a new tool starts. It must still attach to the
    // tree above the auto-advance line.
    m.startToolCall("exec-2", "file_write", "Write hello.ts", "coder");

    const text = renderedText(m);
    expect(text).toContain("Read hello.ts");
    expect(text).toContain("Write hello.ts");
    expect(text).toContain("auto-advancing to next phase.");
  });
});

