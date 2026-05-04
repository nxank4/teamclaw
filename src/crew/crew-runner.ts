/**
 * CrewRunner — top-level multi-agent orchestrator.
 *
 * Current state (this PR): planning step only. The runner loads the
 * configured crew manifest, invokes the Planner agent through the
 * subagent contract, validates and tier-classifies the resulting plan,
 * persists it as a `PlanArtifact`, and returns `{ status: "plan_only" }`.
 *
 * Phase execution, discussion meetings, checkpoints, post-mortems —
 * all later PRs in the v0.4 roadmap.
 *
 * Spec anchors: §5.1 (top-level orchestration), §5.2 (planning phase
 * invariants), §3 Decision 3 (complexity tiers), §4.6 (PlanArtifact),
 * §3 Decision 5 (token budgets, default 50k per task).
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import os from "node:os";

import { debugLog } from "../debug/logger.js";
import { ArtifactStore, type ArtifactStoreReader } from "./artifacts/index.js";
import type { PlanArtifact } from "./artifacts/index.js";
import { classifyPhaseComplexity } from "./complexity.js";
import {
  ensureBuiltInPresets,
  FULL_STACK_PRESET,
  loadUserCrew,
  WRITE_TOOLS,
  type AgentDefinition,
  type CrewManifest,
} from "./manifest/index.js";
import { parsePlan, type ParseError } from "./plan-parser.js";
import {
  runSubagent as defaultRunSubagent,
  type RunSubagentArgs,
  type SubagentResult,
} from "./subagent-runner.js";
import type { CrewPhase, CrewRunOptions } from "./types.js";
import { WriteLockManager } from "./write-lock.js";

export const CREW_RUNNER_PENDING_MESSAGE =
  "crew runner pending — see PR sequence after #105";

export const PLANNER_AGENT_ID = "planner";
export const DEFAULT_MAX_TOKENS_PER_TASK = 50_000;

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export class PlanFailedError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: ParseError,
  ) {
    super(message);
    this.name = "PlanFailedError";
  }
}

export interface CrewPlanResult {
  status: "plan_only";
  session_id: string;
  crew_name: string;
  goal: string;
  phases: CrewPhase[];
  plan_artifact_id: string;
  tokens_used: number;
}

export interface CrewPlanFailedResult {
  status: "plan_failed";
  session_id: string;
  crew_name: string;
  goal: string;
  error: ParseError;
  attempts: number;
}

export type CrewRunResult = CrewPlanResult | CrewPlanFailedResult;

export interface RunPlanningArgs {
  options: CrewRunOptions;
  /** Override session id; defaults to a fresh UUID. */
  session_id?: string;
  /** Override homeDir for preset seeding + artifact JSONL. Tests pass mkdtemp. */
  home_dir?: string;
  /** Override budget; defaults to {@link DEFAULT_MAX_TOKENS_PER_TASK}. */
  max_tokens_per_task?: number;
  /** Test seam — defaults to the real {@link runSubagent}. */
  runSubagentImpl?: (args: RunSubagentArgs) => Promise<SubagentResult>;
  /** Test seam — preload the manifest instead of going through the loader. */
  manifest?: CrewManifest;
}

function resolveManifest(
  options: CrewRunOptions,
  homeDir: string,
  override?: CrewManifest,
): CrewManifest {
  if (override) return override;
  ensureBuiltInPresets(homeDir);
  const name = options.crew_name || FULL_STACK_PRESET;
  return loadUserCrew(name, homeDir);
}

function resolvePlannerAgent(manifest: CrewManifest): AgentDefinition {
  const planner = manifest.agents.find((a) => a.id === PLANNER_AGENT_ID);
  if (!planner) {
    throw new ManifestError(
      `crew '${manifest.name}' has no '${PLANNER_AGENT_ID}' agent — required for planning step`,
    );
  }
  const writeTools = planner.tools.filter((t) => WRITE_TOOLS.has(t));
  if (writeTools.length > 0) {
    throw new ManifestError(
      `planner agent in crew '${manifest.name}' has write tools (${writeTools.join(", ")}); ` +
        `planner must be read-only per spec §5.2 invariants`,
    );
  }
  return planner;
}

function buildPlannerPrompt(
  goal: string,
  manifest: CrewManifest,
  retryHint: string | null,
): string {
  const assignableAgents = manifest.agents.filter((a) => a.id !== PLANNER_AGENT_ID);
  const agentList = assignableAgents
    .map(
      (a) =>
        `- ${a.id} (${a.name}): ${a.description.trim()} — tools: ${a.tools.join(", ")}` +
        (a.write_scope?.length ? ` — write_scope: ${a.write_scope.join(", ")}` : ""),
    )
    .join("\n");

  const baseInstructions = `# Goal

${goal}

# Available agents

${agentList}

# Output format

Respond with JSON only — a top-level array of phases. No prose, no code fences. Each phase has this shape:

\`\`\`
{
  "id": "p1",
  "name": "Short phase name",
  "description": "One-sentence purpose of the phase",
  "tasks": [
    {
      "id": "t1",
      "phase_id": "p1",
      "description": "Concrete, atomic action a single agent can complete",
      "assigned_agent": "<one of the agent ids above>",
      "depends_on": []
    }
  ]
}
\`\`\`

# Hard constraints

- Do NOT assign tasks to '${PLANNER_AGENT_ID}'. The planner does not execute work; assign every task to one of: ${assignableAgents.map((a) => a.id).join(", ")}.
- Each task description names exactly one outcome. No "and also" tasks.
- \`depends_on\` references task ids that already exist (in this phase or an earlier one). No forward references.
- No dependency cycles.
- Each phase has at least one task.
`;

  if (retryHint) {
    return `${baseInstructions}\n\n# Retry — your previous output failed validation\n\n${retryHint}\n\nReturn corrected JSON only.\n`;
  }
  return baseInstructions;
}

function tierDistribution(phases: CrewPhase[]): Record<"1" | "2" | "3", number> {
  const dist: Record<"1" | "2" | "3", number> = { "1": 0, "2": 0, "3": 0 };
  for (const p of phases) dist[p.complexity_tier] += 1;
  return dist;
}

/** Run only the planning phase. Returns plan_only or plan_failed. */
export async function runPlanning(args: RunPlanningArgs): Promise<CrewRunResult> {
  const sessionId = args.session_id ?? randomUUID();
  const homeDir = args.home_dir ?? os.homedir();
  const tokenBudgetCap = args.max_tokens_per_task ?? DEFAULT_MAX_TOKENS_PER_TASK;
  const runSubagent = args.runSubagentImpl ?? defaultRunSubagent;

  const manifest = resolveManifest(args.options, homeDir, args.manifest);
  const planner = resolvePlannerAgent(manifest);
  const lockManager = new WriteLockManager();
  const artifactStore = new ArtifactStore({
    sessionId,
    homeDir,
    lockManager,
  });
  const reader: ArtifactStoreReader = artifactStore.reader();

  debugLog("info", "crew", "crew:plan_started", {
    data: {
      goal: args.options.goal,
      crew_name: manifest.name,
      planner_token_budget: tokenBudgetCap,
      session_id: sessionId,
    },
  });

  const tokenBudget = {
    max_input: tokenBudgetCap,
    max_output: Math.max(1_000, Math.floor(tokenBudgetCap / 3)),
  };

  let lastError: ParseError | null = null;
  let totalTokens = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryHint =
      attempt === 1 || !lastError
        ? null
        : `Previous attempt failed: ${lastError.reason} — ${lastError.message}`;
    const prompt = buildPlannerPrompt(args.options.goal, manifest, retryHint);

    const result = await runSubagent({
      agent_def: planner,
      prompt,
      artifact_reader: reader,
      depth: 0,
      parent_agent_id: null,
      write_lock_manager: lockManager,
      session_id: sessionId,
      token_budget: tokenBudget,
    });
    totalTokens += result.tokens_used;

    const parsed = parsePlan(result.summary);
    if (parsed.ok) {
      const phases: CrewPhase[] = parsed.phases.map((p) => ({
        ...p,
        complexity_tier: classifyPhaseComplexity(p),
      }));

      const planArtifact: PlanArtifact = {
        id: randomUUID(),
        kind: "plan",
        author_agent: PLANNER_AGENT_ID,
        phase_id: null,
        created_at: Date.now(),
        supersedes: null,
        payload: {
          phases: phases.map((p) => ({
            id: p.id,
            name: p.name,
            complexity_tier: p.complexity_tier,
          })),
          tasks: phases.flatMap((p) =>
            p.tasks.map((t) => ({
              id: t.id,
              phase_id: t.phase_id,
              assigned_agent: t.assigned_agent,
              depends_on: t.depends_on,
            })),
          ),
          rationale: result.summary.length > 4000
            ? result.summary.slice(0, 4000) + " [truncated]"
            : result.summary,
        },
      };

      const writeResult = artifactStore.write(planArtifact, PLANNER_AGENT_ID);
      if (!writeResult.written) {
        // The planner is the only writer in this run, so this should not
        // happen — but if it does we still report the failure cleanly.
        debugLog("error", "crew", "crew:plan_artifact_write_failed", {
          data: { reason: writeResult.reason, message: writeResult.message },
        });
        return {
          status: "plan_failed",
          session_id: sessionId,
          crew_name: manifest.name,
          goal: args.options.goal,
          error: {
            reason: "schema_invalid",
            message: `PlanArtifact write rejected: ${writeResult.reason} — ${writeResult.message}`,
          },
          attempts: attempt,
        };
      }

      debugLog("info", "crew", "crew:plan_ready", {
        data: {
          plan_artifact_id: planArtifact.id,
          phase_count: phases.length,
          tier_distribution: tierDistribution(phases),
          attempts: attempt,
          tokens_used: totalTokens,
          session_id: sessionId,
        },
      });

      return {
        status: "plan_only",
        session_id: sessionId,
        crew_name: manifest.name,
        goal: args.options.goal,
        phases,
        plan_artifact_id: planArtifact.id,
        tokens_used: totalTokens,
      };
    }

    lastError = parsed.error;
    debugLog("warn", "crew", "crew:plan_failed", {
      data: {
        reason: parsed.error.reason,
        message: parsed.error.message,
        attempt,
        session_id: sessionId,
      },
    });
  }

  // Two attempts exhausted.
  const finalError = lastError!;
  return {
    status: "plan_failed",
    session_id: sessionId,
    crew_name: manifest.name,
    goal: args.options.goal,
    error: finalError,
    attempts: 2,
  };
}

export class CrewRunner extends EventEmitter {
  async run(options: CrewRunOptions): Promise<CrewRunResult> {
    this.emit("crew:start", {
      goal: options.goal,
      crew_name: options.crew_name,
      workdir: options.workdir,
    });

    const result = await runPlanning({ options });

    if (result.status === "plan_failed") {
      this.emit("crew:done", {
        status: "plan_failed",
        session_id: result.session_id,
        error: result.error,
      });
      throw new PlanFailedError(
        `planning failed after ${result.attempts} attempts: ${result.error.reason}`,
        result.attempts,
        result.error,
      );
    }

    this.emit("crew:plan_ready", {
      session_id: result.session_id,
      plan_artifact_id: result.plan_artifact_id,
      phase_count: result.phases.length,
    });
    return result;
  }
}
