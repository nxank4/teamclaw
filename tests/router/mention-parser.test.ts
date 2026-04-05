import { describe, it, expect } from "vitest";
import { parseMentions } from "../../src/router/mention-parser.js";

const KNOWN_IDS = ["coder", "reviewer", "planner", "tester", "debugger", "researcher", "assistant"];

describe("parseMentions", () => {
  it("parses single @coder mention", () => {
    const result = parseMentions("@coder write a login form", KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(true);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]!.agentId).toBe("coder");
    expect(result.mentions[0]!.task).toBe("write a login form");
  });

  it("parses multiple @coder @reviewer mentions with tasks", () => {
    const result = parseMentions("@coder fix the auth bug @reviewer then check the PR", KNOWN_IDS);
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0]!.agentId).toBe("coder");
    expect(result.mentions[0]!.task).toBe("fix the auth bug");
    expect(result.mentions[1]!.agentId).toBe("reviewer");
    expect(result.mentions[1]!.task).toBe("then check the PR");
  });

  it("resolves aliases: @code → coder, @review → reviewer", () => {
    const result = parseMentions("@code write hello world @review check it", KNOWN_IDS);
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0]!.agentId).toBe("coder");
    expect(result.mentions[1]!.agentId).toBe("reviewer");
  });

  it("ignores unknown @mentions (left in prompt)", () => {
    const result = parseMentions("hey @unknownbot do something", KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(false);
    expect(result.mentions).toHaveLength(0);
    expect(result.cleanedPrompt).toContain("@unknownbot");
  });

  it("ignores @mentions inside backtick code blocks", () => {
    const prompt = "check this code ```\nconst x = @coder.init();\n``` please";
    const result = parseMentions(prompt, KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(false);
    expect(result.mentions).toHaveLength(0);
  });

  it("ignores @mentions inside inline code", () => {
    const prompt = "the variable `@coder` should be renamed";
    const result = parseMentions(prompt, KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(false);
  });

  it("ignores email-like patterns (user@coder.com)", () => {
    const result = parseMentions("send to user@coder.com please", KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(false);
    expect(result.mentions).toHaveLength(0);
  });

  it("handles @agent at start of prompt", () => {
    const result = parseMentions("@planner design the architecture", KNOWN_IDS);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]!.agentId).toBe("planner");
    expect(result.mentions[0]!.position).toBe(0);
  });

  it("handles @agent at end of prompt", () => {
    const result = parseMentions("write tests @tester", KNOWN_IDS);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]!.agentId).toBe("tester");
  });

  it("deduplicates multiple @same-agent mentions", () => {
    const result = parseMentions("@coder fix this @coder also fix that", KNOWN_IDS);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0]!.agentId).toBe("coder");
    expect(result.mentions[0]!.task).toContain("fix this");
    expect(result.mentions[0]!.task).toContain("also fix that");
  });

  it("returns hasExplicitRouting: false when no valid mentions", () => {
    const result = parseMentions("just a normal prompt", KNOWN_IDS);
    expect(result.hasExplicitRouting).toBe(false);
    expect(result.mentions).toHaveLength(0);
  });

  it("cleanedPrompt has mentions stripped, whitespace normalized", () => {
    const result = parseMentions("@coder  write a   login form", KNOWN_IDS);
    expect(result.cleanedPrompt).toBe("write a login form");
  });

  it("handles case-insensitive mentions", () => {
    const result = parseMentions("@Coder fix it @REVIEWER check it", KNOWN_IDS);
    expect(result.mentions).toHaveLength(2);
    expect(result.mentions[0]!.agentId).toBe("coder");
    expect(result.mentions[1]!.agentId).toBe("reviewer");
  });
});
