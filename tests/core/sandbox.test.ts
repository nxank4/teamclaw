import { describe, expect, test } from "vitest";
import path from "node:path";
import { resolveSafePath, SecurityError } from "@/core/sandbox.js";

describe("sandbox.resolveSafePath", () => {
  test("treats absolute-like paths as workspace-rooted", () => {
    const ws = "./openpawl-workspace";
    const out = resolveSafePath("/package.json", ws);
    const wsAbs = path.resolve(process.cwd(), ws);
    expect(out).toBe(path.join(wsAbs, "package.json"));
  });

  test("allows normal relative paths", () => {
    const ws = "./openpawl-workspace";
    const out = resolveSafePath("sub/dir/file.txt", ws);
    const wsAbs = path.resolve(process.cwd(), ws);
    expect(out).toBe(path.join(wsAbs, "sub/dir/file.txt"));
  });

  test("blocks traversal escaping the workspace", () => {
    expect(() => resolveSafePath("../../etc/passwd", "./openpawl-workspace")).toThrow(SecurityError);
  });

  test("blocks tricky traversal variants", () => {
    expect(() => resolveSafePath("sub/../..", "./openpawl-workspace")).toThrow(SecurityError);
    expect(() => resolveSafePath("/../x", "./openpawl-workspace")).toThrow(SecurityError);
  });
});

