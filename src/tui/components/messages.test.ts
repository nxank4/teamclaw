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

/**
 * PR #120 — multi-line tool input wrapping must keep every subline
 * indented under the tree branch instead of letting the wrapped lines
 * fall flush-left and break the visual hierarchy.
 */
describe("MessagesComponent — multi-line tool input rendering", () => {
  function renderedText(m: MessagesComponent, width = 80): string {
    return m.render(width).map(stripAnsi).join("\n");
  }

  it("prefixes every subline of a multi-line tool entry with the vertical tree branch", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "user", content: "build hello.ts" });
    m.addMessage({
      role: "agent",
      agentName: "OpenPawl",
      content: "",
      tag: "thinking",
    });
    // Short-enough heredoc so the 50-char input slice doesn't cut off
    // the subline marker we want to find.
    const heredoc = "ls\nhello-marker";
    m.startToolCall("exec-1", "shell_exec", heredoc, "coder");

    const text = renderedText(m);
    const treeLines = text.split("\n").filter((l) => l.includes("hello-marker"));
    expect(treeLines.length).toBe(1);
    // The wrapped subline must carry a tree-vertical, NOT fall to the
    // left margin. The renderer uses U+2502 (│) for vertical and the
    // line is indented at least one space to keep alignment under
    // the parent badge.
    const wrapped = treeLines[0]!;
    expect(/^\s+│/u.test(wrapped)).toBe(true);
  });
});

/**
 * PR #120 — pending vs running flip via setToolCallStatus on the
 * messages component. Used by router-wiring when the tool executor's
 * ConfirmationNeeded / Start events fire.
 */
describe("MessagesComponent — setToolCallStatus", () => {
  it("flips the most recent matching tool view's status by toolName + agentId", () => {
    const m = new MessagesComponent("test-messages");
    m.startToolCall("exec-1", "shell_exec", "ls", "coder");
    expect(m.setToolCallStatus("shell_exec", "coder", "pending")).toBe(true);
  });

  it("returns false when no in-flight match is found", () => {
    const m = new MessagesComponent("test-messages");
    m.startToolCall("exec-1", "shell_exec", "ls", "coder");
    m.completeToolCall("exec-1", true, "ok", 10);
    // Completed views are no longer in-flight — the wiring should not
    // accidentally promote a finished node back to pending.
    expect(m.setToolCallStatus("shell_exec", "coder", "pending")).toBe(false);
  });

  it("walks tool order in reverse so a fresh call wins over an earlier completed one", () => {
    const m = new MessagesComponent("test-messages");
    m.startToolCall("exec-1", "shell_exec", "first", "coder");
    m.completeToolCall("exec-1", true, "ok", 10);
    m.startToolCall("exec-2", "shell_exec", "second", "coder");
    expect(m.setToolCallStatus("shell_exec", "coder", "pending")).toBe(true);
    // The earlier completed entry is untouched; the later one is now
    // pending. Verified indirectly via hasRunningToolCalls — the
    // pending state does not count as running for spinner purposes.
    expect(m.hasRunningToolCalls()).toBe(false);
  });
});

/**
 * PR #120 — isToolLine classifier must accept both legacy braille
 * spinner frames (already-baked sessions) and the new canonical
 * box-frame set, plus the terminal icons (✓ ✗ ⏳ ◼).
 */
describe("MessagesComponent — baked tool-line classifier", () => {
  function renderedText(m: MessagesComponent, width = 80): string {
    return m.render(width).map(stripAnsi).join("\n");
  }
  function lineCount(text: string, needle: string): number {
    return text.split("\n").filter((l) => l.includes(needle)).length;
  }

  it("baked content with a spinner-frame icon classifies as a tool line and renders under the tree", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({
      role: "agent",
      agentName: "OpenPawl",
      content: "▖ Running ls\n▗ Wrote hello.ts",
    });
    const text = renderedText(m);
    // Both baked lines are recognised; both render.
    expect(lineCount(text, "Running ls")).toBe(1);
    expect(lineCount(text, "Wrote hello.ts")).toBe(1);
  });
});

describe("MessagesComponent.appendToLastAgent", () => {
  // Bug U+10: a tool that needs Y/N confirmation pushes a system
  // message between two streamed agent chunks. The naive appendToLast
  // grows whichever entry happens to be at the array tail. Walking
  // back to the most recent agent message keeps a single
  // "Assistant:" header per turn even when system messages have been
  // pushed onto the stream during streaming.
  it("appends to the most recent agent message even when a system message sits below it", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "agent", agentName: "OpenPawl", content: "I'll read it. " });
    m.addMessage({ role: "system", content: "shell_exec [Y/N]", tag: "tool-approval" });

    const ok = m.appendToLastAgent("Done.");
    expect(ok).toBe(true);

    // The agent message grew; the system message is untouched.
    const text = m.render(80).map(stripAnsi).join("\n");
    expect(text).toContain("I'll read it. Done.");
    expect(text).toContain("shell_exec [Y/N]");
    // Critical: only one agent badge was rendered.
    expect(text.match(/OpenPawl/g)?.length ?? 0).toBe(1);
  });

  it("returns false when there is no agent message to append to", () => {
    const m = new MessagesComponent("test-messages");
    m.addMessage({ role: "user", content: "hi" });
    expect(m.appendToLastAgent("token")).toBe(false);
  });
});

describe("MessagesComponent.addTaskBlockedLine", () => {
  it("appends a system message with the ⊘ glyph, agent, task, and reason", () => {
    // The handler in router-wiring fires this on every
    // RouterEvent.AgentTaskBlocked. The line must carry enough text
    // for the user to act on it without scrolling back to the phase
    // summary or digging through debug logs.
    const m = new MessagesComponent("test-messages");
    m.addTaskBlockedLine({
      agentId: "coder",
      taskName: "Create src/health.ts",
      reasonMessage: "Session token cap reached (10000 / 5000).",
    });
    const text = stripAnsi(m.render(80).join("\n"));
    expect(text).toContain("⊘");
    expect(text).toContain("coder");
    expect(text).toContain("Create src/health.ts");
    expect(text).toContain("Session token cap reached");
    expect(text).toContain("blocked:");
  });

  it("renders the glyph in a colored theme style (ANSI escape present)", () => {
    // Style smoke-test — without the colored glyph the line blends
    // into normal system messages, which defeats the point of an
    // inline alert. We don't pin the exact RGB code (theme-dependent)
    // but we DO pin that an ANSI escape is emitted around the glyph.
    const m = new MessagesComponent("test-messages");
    m.addTaskBlockedLine({
      agentId: "tester",
      taskName: "t1",
      reasonMessage: "x",
    });
    const raw = m.render(80).join("\n");
    expect(stripAnsi(raw)).toContain("⊘");
    expect(raw).toMatch(/\x1b\[/);
  });
});

