import { describe, expect, it, spyOn } from "bun:test";

import { parseArgs } from "./headless.js";

describe("headless parseArgs — checkpoint flags", () => {
  it("defaults: strict_mode false, auto_advance_ms null", () => {
    const opts = parseArgs(["--goal", "x"]);
    expect(opts.strict_mode).toBe(false);
    expect(opts.auto_advance_ms).toBeNull();
  });

  it("--strict sets strict_mode true (still auto-advances headless)", () => {
    const opts = parseArgs(["--goal", "x", "--strict"]);
    expect(opts.strict_mode).toBe(true);
  });

  it("--auto-advance-ms parses non-negative integer", () => {
    const opts = parseArgs(["--goal", "x", "--auto-advance-ms", "5000"]);
    expect(opts.auto_advance_ms).toBe(5000);
  });

  it("--auto-advance-ms 0 is accepted (instant advance)", () => {
    const opts = parseArgs(["--goal", "x", "--auto-advance-ms", "0"]);
    expect(opts.auto_advance_ms).toBe(0);
  });

  it("invalid --auto-advance-ms value exits with error", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("__exit_called__");
    }) as never);
    try {
      expect(() =>
        parseArgs(["--goal", "x", "--auto-advance-ms", "not-a-number"]),
      ).toThrow("__exit_called__");
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("negative --auto-advance-ms is rejected", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("__exit_called__");
    }) as never);
    try {
      expect(() =>
        parseArgs(["--goal", "x", "--auto-advance-ms", "-1"]),
      ).toThrow("__exit_called__");
    } finally {
      errSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("flags coexist with mode + workdir + runs", () => {
    const opts = parseArgs([
      "--goal",
      "x",
      "--mode",
      "crew",
      "--strict",
      "--auto-advance-ms",
      "2000",
      "--runs",
      "3",
    ]);
    expect(opts.mode).toBe("crew");
    expect(opts.strict_mode).toBe(true);
    expect(opts.auto_advance_ms).toBe(2000);
    expect(opts.runs).toBe(3);
  });
});
