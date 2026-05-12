/**
 * ThinkingIndicator — 4-frame box animation with a P-themed word.
 *
 * Symbol and word advance on independent intervals: the box spins at
 * 200ms (smooth motion, 800ms full cycle) while the word stays put for
 * 3s so the user can read it. Coupling the two — as PR #119's first
 * cut did — made the word flicker faster than the eye could track.
 *
 * Tests use compressed intervals injected via the constructor so they
 * complete in milliseconds while still exercising the real
 * setInterval-driven advance logic.
 */
import { describe, expect, it } from "bun:test";

import {
  ThinkingIndicator,
  THINKING_FRAMES,
  THINKING_WORDS,
  SYMBOL_INTERVAL_MS,
  WORD_INTERVAL_MS,
} from "./thinking-indicator.js";
import { stripAnsi } from "../utils/text-width.js";

function parseFrame(text: string): { frame: string; word: string } {
  const stripped = stripAnsi(text).replace(/\.\.\.$/, "");
  // Optional "[Agent]" prefix is followed by a space; the body is
  // always "<frame> <word>".
  const body = stripped.includes("] ") ? stripped.split("] ").pop()! : stripped;
  const [frame = "", word = ""] = body.trim().split(" ");
  return { frame, word };
}

describe("ThinkingIndicator — published cadence", () => {
  it("symbol cadence is 200ms (800ms full 4-frame loop)", () => {
    expect(SYMBOL_INTERVAL_MS).toBe(200);
    expect(SYMBOL_INTERVAL_MS * THINKING_FRAMES.length).toBe(800);
  });

  it("word cadence is 3000ms — slow enough to read", () => {
    expect(WORD_INTERVAL_MS).toBe(3000);
  });

  it("word cadence is meaningfully slower than symbol cadence", () => {
    expect(WORD_INTERVAL_MS).toBeGreaterThanOrEqual(SYMBOL_INTERVAL_MS * 4);
  });
});

describe("ThinkingIndicator — initial frame", () => {
  it("first frame after start() pairs FRAME[0] with one of the P-words", () => {
    const ind = new ThinkingIndicator();
    let captured: string | null = null;
    ind.onUpdate = (text) => {
      captured ??= stripAnsi(text);
    };
    ind.start();
    ind.stop();

    expect(captured).not.toBeNull();
    const { frame, word } = parseFrame(captured!);
    expect(frame).toBe(THINKING_FRAMES[0]!);
    expect(THINKING_WORDS).toContain(word);
  });
});

describe("ThinkingIndicator — symbol vs word lifecycle", () => {
  it("symbol cycles 4 frames per full loop with the word held constant", async () => {
    const ind = new ThinkingIndicator({ symbolIntervalMs: 5, wordIntervalMs: 60_000 });
    const frames: { frame: string; word: string }[] = [];
    ind.onUpdate = (text) => {
      frames.push(parseFrame(stripAnsi(text)));
    };
    ind.start();
    // Wait long enough to capture more than one full 4-frame cycle.
    await Bun.sleep(40);
    ind.stop();

    expect(frames.length).toBeGreaterThanOrEqual(4);
    // All captured frames are valid box characters.
    for (const f of frames) {
      expect(THINKING_FRAMES).toContain(f.frame);
    }
    // Cycle covers all 4 frame characters within the captured window.
    const seenFrames = new Set(frames.map((f) => f.frame));
    expect(seenFrames.size).toBe(THINKING_FRAMES.length);
    // Word is held constant across symbol ticks (the word interval is
    // far longer than the test window, so no rotation happens).
    const seenWords = new Set(frames.map((f) => f.word));
    expect(seenWords.size).toBe(1);
  });

  it("word changes on its own cadence, not on every symbol tick", async () => {
    // Symbol fires ~5x per word tick — if the two were coupled, every
    // symbol frame would carry a different word.
    const ind = new ThinkingIndicator({ symbolIntervalMs: 5, wordIntervalMs: 25 });
    const frames: { frame: string; word: string }[] = [];
    ind.onUpdate = (text) => {
      frames.push(parseFrame(stripAnsi(text)));
    };
    ind.start();
    await Bun.sleep(80);
    ind.stop();

    expect(frames.length).toBeGreaterThan(8);
    const distinctWords = new Set(frames.map((f) => f.word));
    // At least 2 word rotations within the window…
    expect(distinctWords.size).toBeGreaterThanOrEqual(2);
    // …but far fewer rotations than symbol ticks.
    expect(distinctWords.size).toBeLessThan(frames.length / 2);
  });

  it("stop() clears both intervals and silences further updates", async () => {
    const ind = new ThinkingIndicator({ symbolIntervalMs: 5, wordIntervalMs: 5 });
    let count = 0;
    ind.onUpdate = () => {
      count += 1;
    };
    ind.start();
    await Bun.sleep(20);
    ind.stop();
    const afterStop = count;
    await Bun.sleep(20);
    expect(count).toBe(afterStop);
    expect(ind.isVisible()).toBe(false);
    expect(ind.getCurrentText()).toBe("");
  });

  it("restart picks a fresh word and resets the symbol back to frame 1", () => {
    const ind = new ThinkingIndicator();
    const captured: string[] = [];
    ind.onUpdate = (text) => {
      captured.push(stripAnsi(text));
    };
    ind.start();
    ind.stop();
    ind.start();
    ind.stop();

    // Two start cycles → two initial frames captured. Both must begin
    // with FRAMES[0] (symbol resets) and both words live in the pool.
    expect(captured.length).toBeGreaterThanOrEqual(2);
    const first = parseFrame(captured[0]!);
    const second = parseFrame(captured[captured.length - 1]!);
    expect(first.frame).toBe(THINKING_FRAMES[0]!);
    expect(second.frame).toBe(THINKING_FRAMES[0]!);
    expect(THINKING_WORDS).toContain(first.word);
    expect(THINKING_WORDS).toContain(second.word);
  });
});

describe("ThinkingIndicator — per-run word history", () => {
  it("does not repeat words within a single run until the pool exhausts", async () => {
    // Symbol disabled by setting it large enough not to fire during
    // the test window; word fires fast so we collect enough rotations
    // to walk the entire pool.
    const ind = new ThinkingIndicator({ symbolIntervalMs: 60_000, wordIntervalMs: 2 });
    const seen: string[] = [];
    ind.onUpdate = (text) => {
      const { word } = parseFrame(stripAnsi(text));
      if (word) seen.push(word);
    };
    ind.resetRun();
    ind.start();
    // 16 words in pool → wait long enough for ~16 rotations.
    await Bun.sleep(60);
    ind.stop();

    // First 16 captured rotations must all be distinct (one per pool
    // entry). The pool wraps after that, which is allowed.
    const window = seen.slice(0, THINKING_WORDS.length);
    expect(new Set(window).size).toBe(window.length);
  });

  it("resetRun() clears the history so a new dispatch can draw the full pool", async () => {
    const ind = new ThinkingIndicator({ symbolIntervalMs: 60_000, wordIntervalMs: 2 });
    const collect = async () => {
      const seen: string[] = [];
      ind.onUpdate = (text) => {
        const { word } = parseFrame(stripAnsi(text));
        if (word) seen.push(word);
      };
      ind.start();
      await Bun.sleep(40);
      ind.stop();
      return seen;
    };

    ind.resetRun();
    const run1 = await collect();
    ind.resetRun();
    const run2 = await collect();

    // Both runs draw enough words for the pool overlap to be visible
    // — different runs can repeat words from earlier runs.
    expect(run1.length).toBeGreaterThan(4);
    expect(run2.length).toBeGreaterThan(4);
    // resetRun() means run2's first word may be any pool entry,
    // including one that appeared in run1.
    const run1Set = new Set(run1);
    const run2Has = run2.some((w) => run1Set.has(w));
    expect(run2Has).toBe(true);
  });
});
