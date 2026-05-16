/**
 * Headless crew runner — non-interactive entry to the real `runCrew`
 * (src/crew/crew-runner.ts:487). Invoked from print mode when the user
 * passes `--mode crew`. Mirrors the interactive `dispatchCrew` flow
 * (src/router/prompt-router.ts:296) but writes progress directly to
 * stdout/stderr instead of emitting RouterEvents for a TUI host.
 */

import pc from "picocolors";
import { ICONS } from "../tui/constants/icons.js";
import { formatTokens, formatToolTarget } from "../utils/formatters.js";
import { ToolEvent } from "../router/event-types.js";
import { ToolRegistry } from "../tools/registry.js";
import { ToolExecutor } from "../tools/executor.js";
import { PermissionResolver } from "../tools/permissions.js";
import { registerBuiltInTools } from "../tools/built-in/index.js";
import { CheckpointCoordinator } from "../crew/checkpoints.js";
import { FULL_STACK_PRESET } from "../crew/manifest/index.js";
import { runCrew, type RunCrewArgs, type CrewRunResult } from "../crew/crew-runner.js";
import { renderCrewResultMarkdown } from "../router/prompt-router.js";
import type { SubagentProgressEvent } from "../crew/subagent-runner.js";
import {
  addTokens,
  createCrewRunState,
  markAgentBlocked,
  markAgentDone,
  markAgentQueued,
  markAgentRunning,
  type CrewRunState,
} from "./crew-run-state.js";
import { agentDisplayName } from "./agent-display.js";
import type { CrewPhase } from "../crew/types.js";

const STATUS_GLYPH = {
  done: pc.green(ICONS.success),
  running: pc.cyan("►"),
  blocked: pc.red(ICONS.blocked),
  queued: pc.dim(ICONS.dotEmpty),
  skipped: pc.dim("—"),
};

function renderHeadlessCrewTree(state: CrewRunState): string[] {
  const entries = [...state.agents.values()];
  if (entries.length === 0) return [];
  const lines: string[] = [];
  const nameW = Math.max(8, ...entries.map((e) => agentDisplayName(e.agentId).length));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const isLast = i === entries.length - 1;
    const branch = pc.dim(isLast ? "└─" : "├─");
    const glyph = STATUS_GLYPH[entry.status];
    const name = agentDisplayName(entry.agentId).padEnd(nameW);
    const metric =
      entry.status === "blocked"
        ? pc.red(entry.metric)
        : entry.status === "done"
          ? pc.dim(entry.metric)
          : entry.status === "running"
            ? pc.cyan(entry.metric)
            : pc.dim(entry.metric);
    lines.push(`  ${branch} ${glyph}  ${name}  ${metric}`);
  }
  const total = state.totalInputTokens + state.totalOutputTokens;
  lines.push(`     ${pc.dim("tokens")} ${pc.cyan(formatTokens(total))}`);
  return lines;
}

export interface RunCrewHeadlessArgs {
  goal: string;
  /** Defaults to FULL_STACK_PRESET. */
  crewName?: string;
  /** Defaults to process.cwd(). */
  workdir?: string;
  /** Test seam — defaults to the real runCrew. */
  runCrewImpl?: (args: RunCrewArgs) => Promise<CrewRunResult>;
}

export interface HeadlessResult {
  exitCode: number;
}

export async function runCrewHeadless(args: RunCrewHeadlessArgs): Promise<HeadlessResult> {
  const crewName = args.crewName ?? FULL_STACK_PRESET;
  const workdir = args.workdir ?? process.cwd();
  const runCrewFn = args.runCrewImpl ?? runCrew;

  // Tool wiring — identical to solo, including auto-approve.
  const toolReg = new ToolRegistry();
  registerBuiltInTools(toolReg);
  const toolExec = new ToolExecutor(toolReg, new PermissionResolver());
  toolExec.on(ToolEvent.ConfirmationNeeded, ({ approve }: { approve: (always?: boolean) => void }) => {
    approve();
  });

  const sessionId = `print-${Date.now()}`;

  const executeTool = async (toolName: string, toolArgs: Record<string, unknown>) => {
    const result = await toolExec.execute(toolName, toolArgs, {
      sessionId,
      agentId: "crew",
      workingDirectory: workdir,
    });
    if (result.isOk()) {
      const text = result.value.fullOutput || JSON.stringify(result.value.data) || result.value.summary;
      const data = result.value.data as Record<string, unknown> | undefined;
      const diff = data?.diff as import("../utils/diff.js").DiffResult | undefined;
      const shell = toolName === "shell_exec" && data
        ? { exitCode: data.exitCode as number | undefined, stderrHead: typeof data.stderr === "string" ? (data.stderr as string).slice(0, 200) : undefined }
        : undefined;
      const success = result.value.success;
      if (diff || shell) {
        return { text, diff, success, exitCode: shell?.exitCode, stderrHead: shell?.stderrHead };
      }
      return text;
    }
    const cause = "cause" in result.error ? `: ${result.error.cause}` : "";
    throw new Error(`${result.error.type}${cause}`);
  };

  const onProgress = (event: SubagentProgressEvent): void => {
    // Tool-level progress is intentionally quiet in headless mode now —
    // the live agent tree printed via onCrew* callbacks is the primary
    // signal. Only blocked tool calls (uncommon) escape to stdout so
    // the user notices when something stalls.
    if (event.status === "blocked") {
      const target = formatToolTarget(event.details?.inputSummary as string | undefined);
      const label = target ? `${event.tool_name} ${target}` : event.tool_name;
      process.stdout.write(
        `\n  ${pc.yellow(`[${event.agent_id}]`)} ${pc.dim(label)} ${pc.yellow(ICONS.blocked)}`,
      );
    }
  };

  const crewState = createCrewRunState(args.goal);
  let lastTreeLineCount = 0;
  let pendingRender = false;
  let renderScheduled = false;
  const isTTY = !!process.stdout.isTTY;

  function emitTree(): void {
    const lines = renderHeadlessCrewTree(crewState);
    if (isTTY && lastTreeLineCount > 0) {
      // Rewind to the top of the previous tree, then clear each line.
      for (let i = 0; i < lastTreeLineCount; i++) {
        process.stdout.write("\x1b[1A\x1b[2K");
      }
    } else if (!isTTY && lastTreeLineCount > 0) {
      process.stdout.write("\n");
    }
    for (const line of lines) process.stdout.write(line + "\n");
    lastTreeLineCount = lines.length;
  }

  function scheduleRender(): void {
    pendingRender = true;
    if (renderScheduled) return;
    renderScheduled = true;
    setTimeout(() => {
      renderScheduled = false;
      if (!pendingRender) return;
      pendingRender = false;
      emitTree();
    }, 100);
  }

  const coordinator = CheckpointCoordinator.headless();

  try {
    const result = await runCrewFn({
      options: { goal: args.goal, crew_name: crewName, workdir },
      session_id: sessionId,
      workdir,
      checkpointCoordinator: coordinator,
      executeTool,
      getToolSchemas: (toolNames) => toolReg.exportForLLM(toolNames),
      getNativeTools: (toolNames) => toolReg.exportForAPI(toolNames),
      onProgress,
      onCrewPlanReady: (phases: CrewPhase[]) => {
        const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
        markAgentDone(crewState, "planner", `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}`);
        const counts = new Map<string, number>();
        for (const phase of phases) {
          for (const task of phase.tasks) {
            counts.set(task.assigned_agent, (counts.get(task.assigned_agent) ?? 0) + 1);
          }
        }
        for (const [agentId, count] of counts) {
          markAgentQueued(crewState, agentId, `${count} ${count === 1 ? "task" : "tasks"}`);
        }
        scheduleRender();
      },
      onCrewAgentStart: (agentId) => {
        markAgentRunning(crewState, agentId);
        scheduleRender();
      },
      onCrewAgentDone: (agentId, summary) => {
        markAgentDone(crewState, agentId, summary || "done");
        scheduleRender();
      },
      onCrewAgentBlocked: (agentId, reason) => {
        markAgentBlocked(crewState, agentId, reason);
        scheduleRender();
      },
      onCrewTokens: (agentId, input, output) => {
        addTokens(crewState, agentId, input, output);
        scheduleRender();
      },
    });

    // Final tree (force-render even if pending throttle hasn't fired).
    pendingRender = false;
    emitTree();
    process.stdout.write("\n");
    console.log(renderCrewResultMarkdown(result));

    return { exitCode: result.status === "completed" ? 0 : 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${pc.red("Crew run failed:")} ${message}`);
    return { exitCode: 1 };
  }
}
