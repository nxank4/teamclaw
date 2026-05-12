/**
 * Headless crew runner — non-interactive entry to the real `runCrew`
 * (src/crew/crew-runner.ts:487). Invoked from print mode when the user
 * passes `--mode crew`. Mirrors the interactive `dispatchCrew` flow
 * (src/router/prompt-router.ts:296) but writes progress directly to
 * stdout/stderr instead of emitting RouterEvents for a TUI host.
 */

import pc from "picocolors";
import { ICONS } from "../tui/constants/icons.js";
import { formatToolTarget } from "../utils/formatters.js";
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
    const target = formatToolTarget(event.details?.inputSummary as string | undefined);
    const label = target ? `${event.tool_name} ${target}` : event.tool_name;
    if (event.status === "running") {
      process.stdout.write(`\n  ${pc.cyan(`[${event.agent_id}]`)} ${pc.dim(label)}`);
    } else if (event.status === "completed") {
      process.stdout.write(pc.dim(` ${ICONS.success}`));
    } else if (event.status === "failed") {
      process.stdout.write(pc.red(` ${ICONS.error}`));
    } else if (event.status === "blocked") {
      process.stdout.write(pc.yellow(` ${ICONS.warning}`));
    }
  };

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
    });

    process.stdout.write("\n\n");
    console.log(renderCrewResultMarkdown(result));

    return { exitCode: result.status === "completed" ? 0 : 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${pc.red("Crew run failed:")} ${message}`);
    return { exitCode: 1 };
  }
}
