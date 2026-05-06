import { describe, expect, it } from "bun:test";

import { MessagesComponent } from "./messages.js";

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
