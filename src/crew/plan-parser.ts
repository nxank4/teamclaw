/**
 * Plan parser — turn raw Planner LLM output into validated phases.
 *
 * Pipeline: safeJsonParse → Zod validate → semantic checks.
 *
 * Semantic checks (each surfaces as a {@link ParseErrorReason}):
 *   - "json_parse_failed"        — could not extract JSON at all
 *   - "schema_invalid"           — JSON did not match the input shape
 *   - "empty_phase"              — a phase with zero tasks
 *   - "orphan_dependency"        — depends_on references an unknown task
 *   - "dependency_cycle"         — DAG topological sort failed
 *   - "planner_self_assignment"  — planner assigned itself a non-write task
 *
 * Planner self-assignment to a *write-intent* task is silently downgraded
 * to "coder" with a debug-log warning, per spec §5.2 invariants. This
 * mirrors the v0.3 PR #83 guard against planner self-assignment.
 *
 * The parser does NOT classify phases — that lives in `complexity.ts`.
 * The parser DOES default `complexity_tier` to "2" if absent so the
 * Zod default fires; the caller overrides via the classifier afterward.
 */

import { z } from "zod";

import { debugLog } from "../debug/logger.js";
import { safeJsonParse } from "../utils/safe-json-parse.js";

import {
  ComplexityTierSchema,
  CrewPhaseSchema,
  CrewTaskSchema,
  type CrewPhase,
} from "./types.js";

export type ParseErrorReason =
  | "json_parse_failed"
  | "schema_invalid"
  | "empty_phase"
  | "orphan_dependency"
  | "dependency_cycle"
  | "planner_self_assignment";

export interface ParseError {
  reason: ParseErrorReason;
  message: string;
  detail?: Record<string, unknown>;
}

export type ParsePlanResult =
  | { ok: true; phases: CrewPhase[] }
  | { ok: false; error: ParseError };

const WRITE_INTENT_RE =
  /\b(write|edit|create|build|implement|add|modify|update|generate|scaffold|refactor)\b/i;

/**
 * Loose input shape — the LLM doesn't need to fill every CrewTask /
 * CrewPhase field. The parser fills in safe defaults via the full
 * CrewPhaseSchema after the structural pass.
 */
const PlannerTaskInputSchema = z.object({
  id: z.string().min(1),
  phase_id: z.string().min(1),
  description: z.string().min(1),
  assigned_agent: z.string().min(1),
  depends_on: z.array(z.string()).default([]),
});

const PlannerPhaseInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  complexity_tier: ComplexityTierSchema.optional(),
  tasks: z.array(PlannerTaskInputSchema),
});

const PlannerPlanInputSchema = z.array(PlannerPhaseInputSchema).min(1);

function err(
  reason: ParseErrorReason,
  message: string,
  detail?: Record<string, unknown>,
): { ok: false; error: ParseError } {
  return { ok: false, error: { reason, message, detail } };
}

/** Wrap the loose Planner input into full CrewPhaseSchema-defaulted form. */
function inflateToFullSchema(
  input: z.infer<typeof PlannerPlanInputSchema>,
): CrewPhase[] {
  return input.map((phase) =>
    CrewPhaseSchema.parse({
      id: phase.id,
      name: phase.name,
      description: phase.description,
      complexity_tier: phase.complexity_tier ?? "2",
      tasks: phase.tasks.map((t) =>
        CrewTaskSchema.parse({
          id: t.id,
          phase_id: t.phase_id,
          description: t.description,
          assigned_agent: t.assigned_agent,
          depends_on: t.depends_on,
        }),
      ),
    }),
  );
}

/** Detect a cycle in the cross-phase task dependency graph. Returns the cycle path if found. */
function detectCycle(phases: CrewPhase[]): string[] | null {
  const allTasks = new Map<string, string[]>();
  for (const phase of phases) {
    for (const t of phase.tasks) {
      allTasks.set(t.id, t.depends_on);
    }
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of allTasks.keys()) color.set(id, WHITE);

  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    const deps = allTasks.get(node) ?? [];
    for (const dep of deps) {
      const c = color.get(dep);
      if (c === GRAY) {
        const idx = stack.indexOf(dep);
        return idx === -1 ? [dep, node] : [...stack.slice(idx), dep];
      }
      if (c === WHITE) {
        const found = dfs(dep);
        if (found) return found;
      }
    }
    color.set(node, BLACK);
    stack.pop();
    return null;
  }

  for (const id of allTasks.keys()) {
    if (color.get(id) === WHITE) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** Find any depends_on entry that points at an unknown task id. */
function findOrphanDependency(
  phases: CrewPhase[],
): { task_id: string; missing_dep: string } | null {
  const allTaskIds = new Set<string>();
  for (const phase of phases) {
    for (const t of phase.tasks) allTaskIds.add(t.id);
  }
  for (const phase of phases) {
    for (const t of phase.tasks) {
      for (const dep of t.depends_on) {
        if (!allTaskIds.has(dep)) {
          return { task_id: t.id, missing_dep: dep };
        }
      }
    }
  }
  return null;
}

/**
 * Resolve planner self-assignment. Write-intent tasks are silently
 * downgraded to coder; non-write-intent self-assignments are rejected
 * (the planner shouldn't assign itself read-only research either —
 * planning is the only valid planner activity, and that doesn't appear
 * as a Task in the output).
 */
function resolvePlannerSelfAssignment(
  phases: CrewPhase[],
): { ok: true; phases: CrewPhase[] } | { ok: false; error: ParseError } {
  const next: CrewPhase[] = [];
  for (const phase of phases) {
    const fixed: CrewPhase = { ...phase, tasks: [...phase.tasks] };
    for (let i = 0; i < fixed.tasks.length; i++) {
      const task = fixed.tasks[i]!;
      if (task.assigned_agent !== "planner") continue;
      const isWriteIntent = WRITE_INTENT_RE.test(task.description);
      if (!isWriteIntent) {
        return err(
          "planner_self_assignment",
          `Planner assigned non-write task '${task.id}' to itself; planner cannot execute tasks`,
          { task_id: task.id, description: task.description },
        );
      }
      debugLog("warn", "crew", "planner_self_assignment_downgraded", {
        data: {
          task_id: task.id,
          phase_id: task.phase_id,
          description: task.description,
          downgraded_to: "coder",
        },
      });
      fixed.tasks[i] = { ...task, assigned_agent: "coder" };
    }
    next.push(fixed);
  }
  return { ok: true, phases: next };
}

export function parsePlan(rawLLMOutput: string): ParsePlanResult {
  const parsed = safeJsonParse<unknown>(rawLLMOutput);
  if (!parsed.parsed) {
    return err("json_parse_failed", `safeJsonParse failed: ${parsed.error}`, {
      preview: rawLLMOutput.slice(0, 200),
    });
  }

  // Accept either a top-level array of phases, or { phases: [...] } envelope.
  const candidate = Array.isArray(parsed.data)
    ? parsed.data
    : (parsed.data as { phases?: unknown }).phases;

  const validated = PlannerPlanInputSchema.safeParse(candidate);
  if (!validated.success) {
    return err(
      "schema_invalid",
      validated.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; "),
      { issue_count: validated.error.issues.length },
    );
  }

  const phases = inflateToFullSchema(validated.data);

  for (const phase of phases) {
    if (phase.tasks.length === 0) {
      return err("empty_phase", `Phase '${phase.id}' has zero tasks`, {
        phase_id: phase.id,
      });
    }
  }

  const orphan = findOrphanDependency(phases);
  if (orphan) {
    return err(
      "orphan_dependency",
      `Task '${orphan.task_id}' depends on unknown task '${orphan.missing_dep}'`,
      orphan as unknown as Record<string, unknown>,
    );
  }

  const cycle = detectCycle(phases);
  if (cycle) {
    return err(
      "dependency_cycle",
      `Dependency cycle: ${cycle.join(" → ")}`,
      { cycle },
    );
  }

  const downgraded = resolvePlannerSelfAssignment(phases);
  if (!downgraded.ok) return downgraded;

  return { ok: true, phases: downgraded.phases };
}
