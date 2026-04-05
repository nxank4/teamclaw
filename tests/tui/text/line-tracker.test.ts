import { describe, it, expect } from "vitest";
import { LineTracker } from "../../../src/tui/text/line-tracker.js";

describe("LineTracker", () => {
  it("addMapping stores correctly", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 2, originalText: "hello world", messageIndex: 0, type: "user" });
    expect(lt.getMappings()).toHaveLength(1);
  });

  it("reconstructOriginal joins without visual newlines", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 2, originalText: "this is a long message that was wrapped", messageIndex: 0, type: "agent" });
    const text = lt.reconstructOriginal(0, 2);
    expect(text).toBe("this is a long message that was wrapped");
    expect(text).not.toContain("\n"); // no visual wrap newlines
  });

  it("reconstructOriginal preserves original newlines across messages", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 0, originalText: "line one", messageIndex: 0, type: "user" });
    lt.addMapping({ visualLineStart: 1, visualLineEnd: 1, originalText: "line two", messageIndex: 1, type: "agent" });
    const text = lt.reconstructOriginal(0, 1);
    expect(text).toBe("line one\nline two");
  });

  it("findMessage returns correct messageIndex", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 2, originalText: "msg 0", messageIndex: 0, type: "user" });
    lt.addMapping({ visualLineStart: 3, visualLineEnd: 5, originalText: "msg 1", messageIndex: 1, type: "agent" });
    expect(lt.findMessage(1)?.messageIndex).toBe(0);
    expect(lt.findMessage(4)?.messageIndex).toBe(1);
    expect(lt.findMessage(10)).toBeNull();
  });

  it("clear removes all mappings", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 0, originalText: "test", messageIndex: 0, type: "user" });
    lt.clear();
    expect(lt.getMappings()).toHaveLength(0);
    expect(lt.getTotalVisualLines()).toBe(0);
  });

  it("getTotalVisualLines returns correct count", () => {
    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 2, originalText: "a", messageIndex: 0, type: "user" });
    lt.addMapping({ visualLineStart: 3, visualLineEnd: 5, originalText: "b", messageIndex: 1, type: "agent" });
    expect(lt.getTotalVisualLines()).toBe(6);
  });
});
