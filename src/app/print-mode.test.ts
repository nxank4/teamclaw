import { describe, expect, it } from "bun:test";
import { parsePrintModeArgs } from "./index.js";

describe("parsePrintModeArgs", () => {
  it("returns goal with solo mode by default", () => {
    const r = parsePrintModeArgs(["hello"]);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.goal).toBe("hello");
    expect(r.mode).toBe("solo");
    expect(r.crewName).toBeUndefined();
    expect(r.workdir).toBeUndefined();
  });

  it("parses --mode crew", () => {
    const r = parsePrintModeArgs(["build a thing", "--mode", "crew"]);
    if ("error" in r) throw new Error(r.error);
    expect(r.goal).toBe("build a thing");
    expect(r.mode).toBe("crew");
  });

  it("parses --crew <name> + --mode crew + --workdir together", () => {
    const r = parsePrintModeArgs([
      "ship feature X",
      "--mode",
      "crew",
      "--crew",
      "my-team",
      "--workdir",
      "/tmp/proj",
    ]);
    if ("error" in r) throw new Error(r.error);
    expect(r.goal).toBe("ship feature X");
    expect(r.mode).toBe("crew");
    expect(r.crewName).toBe("my-team");
    expect(r.workdir).toBe("/tmp/proj");
  });

  it("solo path keeps crewName undefined even with --workdir", () => {
    const r = parsePrintModeArgs(["fix bug", "--workdir", "/srv/x"]);
    if ("error" in r) throw new Error(r.error);
    expect(r.mode).toBe("solo");
    expect(r.crewName).toBeUndefined();
    expect(r.workdir).toBe("/srv/x");
  });

  it("rejects unknown --mode value", () => {
    const r = parsePrintModeArgs(["x", "--mode", "bogus"]);
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain("bogus");
  });

  it("rejects missing prompt", () => {
    const r = parsePrintModeArgs(["--mode", "crew"]);
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain("missing prompt");
  });

  it("rejects unexpected argument", () => {
    const r = parsePrintModeArgs(["x", "--bogus-flag"]);
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toContain("unexpected");
  });

  it("flag order is positional-first", () => {
    // Goal is the first non-flag arg, regardless of where flags appear.
    const r = parsePrintModeArgs(["--mode", "crew", "do it"]);
    if ("error" in r) throw new Error(r.error);
    expect(r.goal).toBe("do it");
    expect(r.mode).toBe("crew");
  });
});
