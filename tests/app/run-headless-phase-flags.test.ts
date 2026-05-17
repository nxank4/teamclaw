import { describe, expect, it } from "bun:test";

import { parsePrintArgs } from "../../src/app/index.js";

describe("parsePrintArgs — phase flags", () => {
  it("parses --spec + --plan", () => {
    const result = parsePrintArgs([
      "refactor everything",
      "--spec", "./specs/foo.md",
      "--plan", "./plans/foo.md",
    ]);
    expect("error" in result).toBe(false);
    if ("goal" in result) {
      expect(result.goal).toBe("refactor everything");
      expect(result.specPath).toBe("./specs/foo.md");
      expect(result.planPath).toBe("./plans/foo.md");
      expect(result.noSpec ?? false).toBe(false);
    }
  });

  it("parses --no-spec without a value", () => {
    const result = parsePrintArgs(["x", "--no-spec"]);
    if ("goal" in result) {
      expect(result.noSpec).toBe(true);
      expect(result.specPath).toBeUndefined();
      expect(result.planPath).toBeUndefined();
    }
  });

  it("rejects --spec with no following value", () => {
    const result = parsePrintArgs(["x", "--spec"]);
    expect("error" in result).toBe(true);
  });

  it("rejects an unknown flag", () => {
    const result = parsePrintArgs(["x", "--banana"]);
    expect("error" in result).toBe(true);
  });

  it("still parses just the bare prompt + workdir", () => {
    const result = parsePrintArgs(["what is 2+2", "--workdir", "/tmp"]);
    if ("goal" in result) {
      expect(result.goal).toBe("what is 2+2");
      expect(result.workdir).toBe("/tmp");
      expect(result.noSpec).toBeFalsy();
    }
  });
});
