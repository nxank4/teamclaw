import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @clack/prompts
const mockSelect = vi.fn();
const mockText = vi.fn();
const mockOutro = vi.fn();
vi.mock("@clack/prompts", () => ({
  select: (...args: unknown[]) => mockSelect(...args),
  text: (...args: unknown[]) => mockText(...args),
  isCancel: (val: unknown) => val === Symbol.for("cancel"),
  outro: (...args: unknown[]) => mockOutro(...args),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn(), plain: vi.fn() },
}));

import { showPostSessionMenu } from "../../src/work-runner/post-session-menu.js";

describe("post-session menu", () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    mockSelect.mockReset();
    mockText.mockReset();
    mockOutro.mockReset();
    // Simulate TTY by default
    Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
  });

  it("\"continue\" returns continue choice", async () => {
    mockSelect.mockResolvedValueOnce("continue");
    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("continue");
  });

  it("\"new-goal\" prompts for goal then returns it", async () => {
    mockSelect.mockResolvedValueOnce("new-goal");
    mockText.mockResolvedValueOnce("Build a REST API");

    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("new-goal");
    expect(result.newGoal).toBe("Build a REST API");
  });

  it("\"new-goal\" with empty text returns exit", async () => {
    mockSelect.mockResolvedValueOnce("new-goal");
    mockText.mockResolvedValueOnce("");

    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("exit");
  });

  it("\"exit\" returns exit choice", async () => {
    mockSelect.mockResolvedValueOnce("exit");
    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("exit");
  });

  it("menu skipped when stdin is not TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, writable: true });
    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("exit");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("menu skipped with --no-interactive flag", async () => {
    const result = await showPostSessionMenu({ noInteractive: true });
    expect(result.choice).toBe("exit");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("isCancel() handled gracefully on Ctrl+C", async () => {
    mockSelect.mockResolvedValueOnce(Symbol.for("cancel"));
    const result = await showPostSessionMenu({});
    expect(result.choice).toBe("exit");
    expect(mockOutro).toHaveBeenCalled();
  });

  it("passes dashboard port to menu options", async () => {
    mockSelect.mockResolvedValueOnce("exit");
    await showPostSessionMenu({ dashboardPort: 8080 });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({
            value: "dashboard",
            hint: "http://localhost:8080",
          }),
        ]),
      }),
    );
  });
});
