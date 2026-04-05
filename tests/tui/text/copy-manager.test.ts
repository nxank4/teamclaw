import { describe, it, expect, vi } from "vitest";
import { CopyManager } from "../../../src/tui/text/copy-manager.js";
import { LineTracker } from "../../../src/tui/text/line-tracker.js";

describe("CopyManager", () => {
  it("copyToClipboard writes via OSC 52 to terminal", async () => {
    const cm = new CopyManager();
    const writeFn = vi.fn();
    cm.setTerminal({ write: writeFn, start: vi.fn(), stop: vi.fn(), onInput: vi.fn(), onResize: vi.fn(), columns: 80, rows: 24 } as any);
    const success = await cm.copyToClipboard("hello");
    expect(success).toBe(true);
    expect(writeFn).toHaveBeenCalledOnce();
    const written = writeFn.mock.calls[0]![0] as string;
    expect(written).toContain("\x1b]52;c;");
    // Verify base64 encoding
    const b64 = Buffer.from("hello").toString("base64");
    expect(written).toContain(b64);
  });

  it("copyMessage returns original text without visual newlines", async () => {
    const cm = new CopyManager();
    const writeFn = vi.fn();
    cm.setTerminal({ write: writeFn, start: vi.fn(), stop: vi.fn(), onInput: vi.fn(), onResize: vi.fn(), columns: 80, rows: 24 } as any);
    const success = await cm.copyMessage("original text without wrapping artifacts");
    expect(success).toBe(true);
  });

  it("copyCodeBlock strips ``` markers", async () => {
    const cm = new CopyManager();
    const writeFn = vi.fn();
    cm.setTerminal({ write: writeFn, start: vi.fn(), stop: vi.fn(), onInput: vi.fn(), onResize: vi.fn(), columns: 80, rows: 24 } as any);
    await cm.copyCodeBlock("```typescript\nconst x = 1;\n```");
    const written = writeFn.mock.calls[0]![0] as string;
    const b64Part = written.replace(/.*52;c;/, "").replace(/\x07.*/, "");
    const decoded = Buffer.from(b64Part, "base64").toString("utf-8");
    expect(decoded).toBe("const x = 1;");
  });

  it("copyVisualRange uses LineTracker to reconstruct", async () => {
    const cm = new CopyManager();
    const writeFn = vi.fn();
    cm.setTerminal({ write: writeFn, start: vi.fn(), stop: vi.fn(), onInput: vi.fn(), onResize: vi.fn(), columns: 80, rows: 24 } as any);

    const lt = new LineTracker();
    lt.addMapping({ visualLineStart: 0, visualLineEnd: 2, originalText: "long text that was wrapped", messageIndex: 0, type: "agent" });

    const success = await cm.copyVisualRange(0, 2, lt);
    expect(success).toBe(true);
    const written = writeFn.mock.calls[0]![0] as string;
    const b64Part = written.replace(/.*52;c;/, "").replace(/\x07.*/, "");
    const decoded = Buffer.from(b64Part, "base64").toString("utf-8");
    expect(decoded).toBe("long text that was wrapped");
  });
});
