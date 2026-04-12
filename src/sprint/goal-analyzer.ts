/**
 * Keyword-based goal analysis for autonomous team composition.
 * Selects agents based on goal text — no LLM calls.
 */
import type { TeamComposition, TemplateAgent } from "../templates/types.js";

interface AgentRule {
  /** Keywords that trigger inclusion. */
  include?: string[];
  /** Keywords that trigger exclusion (overrides include). */
  exclude?: string[];
  /** Always include this agent. */
  always?: boolean;
  /** Include if estimated task count >= this threshold. */
  minTasks?: number;
  /** Human-readable description of what this agent does. */
  task: string;
}

const AGENT_RULES: Record<string, AgentRule> = {
  planner: {
    always: true,
    task: "Task breakdown and planning",
  },
  coder: {
    always: true,
    include: [
      "build", "implement", "create", "code", "write", "develop",
      "api", "server", "frontend", "backend", "database", "app",
      "website", "script", "function", "component", "module",
    ],
    task: "Implementation",
  },
  reviewer: {
    include: [
      "review", "quality", "security", "audit", "check",
      "production", "deploy", "scale", "refactor", "clean",
    ],
    minTasks: 3,
    task: "Code review",
  },
  tester: {
    include: [
      "test", "coverage", "qa", "validation", "reliability",
      "integration test", "unit test", "e2e", "spec", "verify",
    ],
    minTasks: 2,
    task: "Testing",
  },
  debugger: {
    include: [
      "debug", "fix", "bug", "error", "crash", "investigate",
      "troubleshoot", "performance", "slow", "memory leak",
      "broken", "failing", "issue", "regression",
    ],
    exclude: ["build", "create", "new project", "from scratch", "scaffold"],
    task: "Debugging and fixing",
  },
  researcher: {
    include: [
      "research", "investigate", "compare", "evaluate",
      "find", "explore", "survey", "benchmark",
    ],
    exclude: ["build", "implement", "create", "code"],
    task: "Research and analysis",
  },
};

/** Estimate number of tasks from goal complexity. */
function estimateTaskCount(goal: string): number {
  const lower = goal.toLowerCase();
  const conjunctions = (lower.match(/\b(and|with|plus|also|including|then)\b/g) ?? []).length;
  const commas = (goal.match(/,/g) ?? []).length;
  const length = goal.length;

  // Base: 2 tasks (setup + one feature)
  let estimate = 2;
  estimate += conjunctions;
  estimate += Math.floor(commas / 2);
  if (length > 100) estimate += 1;
  if (length > 200) estimate += 1;

  return Math.min(estimate, 10);
}

/** Check if any keyword from the list appears in the text. */
function matchesKeywords(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

export interface CompositionEntry {
  role: string;
  task: string;
  included: boolean;
  reason: string;
}

export interface GoalAnalysis {
  composition: TeamComposition;
  entries: CompositionEntry[];
  estimatedTasks: number;
}

/**
 * Analyze a goal and return autonomous team composition.
 * Pure keyword matching — no LLM calls.
 */
export function analyzeGoal(goal: string, _options?: { runs?: number }): GoalAnalysis {
  const lower = goal.toLowerCase();
  const estimatedTasks = estimateTaskCount(goal);
  const entries: CompositionEntry[] = [];
  const activeAgents: TemplateAgent[] = [];
  const excludedAgents: { role: string; reason: string }[] = [];
  let matchCount = 0;
  let totalChecks = 0;

  for (const [role, rule] of Object.entries(AGENT_RULES)) {
    totalChecks++;
    let included = false;
    let reason = "";

    // Check exclusions first
    if (rule.exclude) {
      const excludeMatch = matchesKeywords(lower, rule.exclude);
      if (excludeMatch) {
        reason = `excluded ("${excludeMatch}" in goal)`;
        entries.push({ role, task: rule.task, included: false, reason });
        excludedAgents.push({ role, reason });
        continue;
      }
    }

    // Always-included agents
    if (rule.always) {
      included = true;
      const includeMatch = rule.include ? matchesKeywords(lower, rule.include) : null;
      reason = includeMatch
        ? `"${includeMatch}" keyword detected`
        : "always included";
      if (includeMatch) matchCount++;
    }

    // Keyword-based inclusion
    if (!included && rule.include) {
      const match = matchesKeywords(lower, rule.include);
      if (match) {
        included = true;
        reason = `"${match}" keyword detected`;
        matchCount++;
      }
    }

    // Task-count-based inclusion
    if (!included && rule.minTasks && estimatedTasks >= rule.minTasks) {
      included = true;
      reason = `${estimatedTasks} tasks estimated (threshold: ${rule.minTasks})`;
      matchCount++;
    }

    if (!included) {
      reason = "no matching keywords";
      excludedAgents.push({ role, reason });
    }

    entries.push({ role, task: rule.task, included, reason });
    if (included) {
      activeAgents.push({ role, task: rule.task });
    }
  }

  // Confidence: ratio of keyword matches to total agent checks
  const confidence = totalChecks > 0
    ? Math.round((matchCount / totalChecks) * 100) / 100
    : 0.5;

  // Default fallback: ensure at least planner + coder
  if (activeAgents.length === 0) {
    activeAgents.push({ role: "planner", task: "Task breakdown and planning" });
    activeAgents.push({ role: "coder", task: "Implementation" });
  }

  return {
    composition: {
      mode: "autonomous",
      activeAgents,
      excludedAgents: excludedAgents.length > 0 ? excludedAgents : undefined,
      confidence,
    },
    entries,
    estimatedTasks,
  };
}
