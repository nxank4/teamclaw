/**
 * Complexity-tier classifier per spec §3 Decision 3.
 *
 * Three tiers, three downstream meeting costs:
 *   - "1": skip the discussion meeting entirely
 *   - "2": lightweight 1-round meeting
 *   - "3": full 2-round RA-CR synthesis
 *
 * Heuristic inputs (all phase-local):
 *   - task_count: number of tasks in the phase
 *   - unique_files_mentioned: distinct path-shaped tokens in task
 *     descriptions (e.g. `src/foo.ts`, `package.json`, `README.md`).
 *     Best-effort regex — the planner doesn't always reference files
 *     by path, so we only use this when available.
 *   - max_dependency_depth: longest path in the in-phase task DAG. A
 *     task with no deps within the phase has depth 0.
 *   - has_in_phase_dependencies: whether any task has a depends_on
 *     entry pointing at another task in the same phase (used by the
 *     Tier-1 floor).
 *
 * Decision rules (Tier 3 escalations checked first so cross-cutting work
 * cannot fall back into Tier 1):
 *   - Tier 3 if task_count ≥ 5 OR max_dependency_depth > 2 OR any
 *     cross-phase task reference
 *   - Tier 1 if task_count ≤ 2 AND unique_files ≤ 2 AND no dependencies
 *     of any kind (in-phase OR cross-phase)
 *   - Tier 2 otherwise
 *
 * Empty phases default to Tier 1 (defensive — should be rejected by
 * plan-parser before reaching the classifier, but a well-defined output
 * keeps tests deterministic).
 */

import type { ComplexityTier, CrewPhase } from "./types.js";

// Path-shaped tokens. Conservative — must contain a `/` or end in a
// recognised extension, and must be at least 4 chars to avoid matching
// arbitrary words like "ts" or "md". The set covers the file types crews
// realistically touch; it's not exhaustive.
const FILE_PATH_RE = /[\w./-]+\.(?:ts|tsx|js|jsx|md|json|yaml|yml|toml|css|scss|html|sql|py|rs|go|java|kt|swift|sh)\b/g;

function uniqueFilesMentioned(phase: CrewPhase): number {
  const set = new Set<string>();
  for (const task of phase.tasks) {
    const matches = task.description.match(FILE_PATH_RE);
    if (matches) {
      for (const m of matches) set.add(m);
    }
  }
  return set.size;
}

function maxDependencyDepth(phase: CrewPhase): number {
  const taskIds = new Set(phase.tasks.map((t) => t.id));
  const inPhaseDeps = new Map<string, string[]>();
  for (const task of phase.tasks) {
    inPhaseDeps.set(
      task.id,
      task.depends_on.filter((d) => taskIds.has(d)),
    );
  }
  const memo = new Map<string, number>();

  function depthOf(id: string, stack: Set<string>): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0; // cycle guard — caller should reject upstream
    const deps = inPhaseDeps.get(id) ?? [];
    if (deps.length === 0) {
      memo.set(id, 0);
      return 0;
    }
    stack.add(id);
    let best = 0;
    for (const dep of deps) {
      best = Math.max(best, 1 + depthOf(dep, stack));
    }
    stack.delete(id);
    memo.set(id, best);
    return best;
  }

  let max = 0;
  for (const task of phase.tasks) {
    max = Math.max(max, depthOf(task.id, new Set()));
  }
  return max;
}

function hasCrossPhaseReferences(
  phase: CrewPhase,
  inPhaseTaskIds: Set<string>,
): boolean {
  for (const task of phase.tasks) {
    for (const dep of task.depends_on) {
      if (!inPhaseTaskIds.has(dep)) return true;
    }
  }
  return false;
}

function hasInPhaseDependencies(
  phase: CrewPhase,
  inPhaseTaskIds: Set<string>,
): boolean {
  for (const task of phase.tasks) {
    for (const dep of task.depends_on) {
      if (inPhaseTaskIds.has(dep)) return true;
    }
  }
  return false;
}

export interface ComplexityHeuristic {
  tier: ComplexityTier;
  task_count: number;
  unique_files: number;
  max_depth: number;
  cross_phase: boolean;
  in_phase_deps: boolean;
}

/**
 * Diagnostic helper that returns the full heuristic snapshot. Useful for
 * debug logs and the tier_distribution telemetry the runner emits on
 * `crew:plan_ready`.
 */
export function describePhaseComplexity(phase: CrewPhase): ComplexityHeuristic {
  const taskCount = phase.tasks.length;
  if (taskCount === 0) {
    return {
      tier: "1",
      task_count: 0,
      unique_files: 0,
      max_depth: 0,
      cross_phase: false,
      in_phase_deps: false,
    };
  }

  const inPhaseTaskIds = new Set(phase.tasks.map((t) => t.id));
  const uniqueFiles = uniqueFilesMentioned(phase);
  const maxDepth = maxDependencyDepth(phase);
  const crossPhase = hasCrossPhaseReferences(phase, inPhaseTaskIds);
  const inPhaseDeps = hasInPhaseDependencies(phase, inPhaseTaskIds);

  let tier: ComplexityTier;
  if (taskCount >= 5 || maxDepth > 2 || crossPhase) {
    tier = "3";
  } else if (taskCount <= 2 && uniqueFiles <= 2 && !inPhaseDeps && !crossPhase) {
    tier = "1";
  } else {
    tier = "2";
  }

  return {
    tier,
    task_count: taskCount,
    unique_files: uniqueFiles,
    max_depth: maxDepth,
    cross_phase: crossPhase,
    in_phase_deps: inPhaseDeps,
  };
}

export function classifyPhaseComplexity(phase: CrewPhase): ComplexityTier {
  return describePhaseComplexity(phase).tier;
}
