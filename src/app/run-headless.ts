/**
 * Headless runner — single-path execution with no TUI.
 *
 * Invoked from print mode (`openpawl -p "<goal>"`). Replaces the
 * solo/crew headless pair after the mode distinction was removed.
 *
 * Dispatch path: load the markdown agent registry, pick top-K agents by
 * similarity match against the goal, run each via the orchestrator
 * subagent runner.
 */

import pc from "picocolors";

import { loadAgentRegistry } from "../agents/registry/markdown-registry.js";
import { buildDefaultGlobalConfig, readGlobalConfig } from "../core/global-config.js";
import { debugLog } from "../debug/logger.js";
import { dispatch as orchestratorDispatch } from "../orchestrator/dispatcher.js";
import { ToolEvent } from "../router/event-types.js";
import { createSessionManager } from "../session/index.js";
import { classify } from "../spec/complexity.js";
import { registerBuiltInTools } from "../tools/built-in/index.js";
import { ToolExecutor } from "../tools/executor.js";
import { PermissionResolver } from "../tools/permissions.js";
import { ToolRegistry } from "../tools/registry.js";
import { ICONS } from "../tui/constants/icons.js";
import { formatDuration, formatToolTarget } from "../utils/formatters.js";

export interface RunHeadlessArgs {
  goal: string;
  /** Defaults to process.cwd(). */
  workdir?: string;
}

export interface HeadlessResult {
  exitCode: number;
}

export async function runHeadless(args: RunHeadlessArgs): Promise<HeadlessResult> {
  const workdir = args.workdir ?? process.cwd();

  // Per-run cwd switch so agent tool calls (file_write etc.) target workdir.
  const originalCwd = process.cwd();
  if (workdir !== originalCwd) process.chdir(workdir);

  // Complexity classification — log only, no dispatch change yet.
  // Matches the call in src/app/prompt-handler.ts so the same signal
  // is observable from both the TUI and headless entry points.
  {
    const cfg = readGlobalConfig() ?? buildDefaultGlobalConfig();
    const result = classify(args.goal, cfg.complexityThreshold);
    debugLog("info", "orchestrator", "complexity_classified", {
      data: {
        class: result.class,
        reasons: result.reasons,
        prompt_excerpt: args.goal.slice(0, 80),
      },
    });
  }

  try {
    const sessionMgr = createSessionManager();
    await sessionMgr.initialize();

    const toolReg = new ToolRegistry();
    registerBuiltInTools(toolReg);
    const toolExec = new ToolExecutor(toolReg, new PermissionResolver());

    // Auto-approve tool confirmations in headless mode.
    toolExec.on(ToolEvent.ConfirmationNeeded, ({ approve }: { approve: (always?: boolean) => void }) => {
      approve();
    });

    const sessionResult = await sessionMgr.create(workdir);
    if (sessionResult.isErr()) {
      console.error(`Failed to create session: ${sessionResult.error.type}`);
      return { exitCode: 1 };
    }
    const session = sessionResult.value;

    const registry = await loadAgentRegistry({ cwd: workdir });
    for (const loadErr of registry.loadErrors()) {
      console.error(pc.yellow(`agent load warning: ${loadErr.message}`));
    }

    let currentAgent = "";
    let tokenCount = 0;
    const agentStartTimes = new Map<string, number>();

    const dispatchResult = await orchestratorDispatch({
      task: args.goal,
      registry,
      sessionId: session.id,
      getToolSchemas: (toolNames) => toolReg.exportForLLM(toolNames),
      getNativeTools: (toolNames) => toolReg.exportForAPI(toolNames),
      executeTool: async (toolName, toolArgs) => {
        const result = await toolExec.execute(toolName, toolArgs, {
          sessionId: session.id,
          agentId: currentAgent || "agent",
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
      },
      onToken: (agentId, _token) => {
        if (agentId !== currentAgent) {
          if (currentAgent) {
            const elapsed = Date.now() - (agentStartTimes.get(currentAgent) ?? Date.now());
            process.stdout.write(
              ` ${pc.dim("→")} ${pc.green("done")} (${formatDuration(elapsed)}, ${tokenCount} tokens)\n`,
            );
          }
          currentAgent = agentId;
          tokenCount = 0;
          agentStartTimes.set(agentId, Date.now());
          process.stdout.write(`  ${pc.cyan(`[${agentId}]`)} started`);
        }
        tokenCount++;
      },
      onProgress: (event) => {
        const status = event.status;
        if (status === "running") {
          const target = formatToolTarget(event.details?.inputSummary as string | undefined);
          const label = target ? `${event.tool_name} ${target}` : event.tool_name;
          process.stdout.write(`\n    ${pc.dim(label)}`);
        } else if (status === "completed") {
          process.stdout.write(pc.dim(` ${ICONS.success}`));
        } else if (status === "failed") {
          process.stdout.write(pc.red(` ${ICONS.error}`));
        }
      },
    });

    if (currentAgent) {
      const elapsed = Date.now() - (agentStartTimes.get(currentAgent) ?? Date.now());
      process.stdout.write(
        ` ${pc.dim("→")} ${pc.green("done")} (${formatDuration(elapsed)}, ${tokenCount} tokens)\n`,
      );
    }

    if (dispatchResult.kind === "blocked") {
      console.error(pc.red(`\n${dispatchResult.message}`));
      await sessionMgr.delete(session.id);
      await sessionMgr.shutdown();
      return { exitCode: 2 };
    }

    const executed = dispatchResult.result;

    console.log("");
    let hadSuccess = false;
    for (const agentResult of executed.agentResults) {
      if (agentResult.error || !agentResult.success) {
        console.log(pc.dim("─".repeat(60)));
        console.log(`${pc.bold(`[${agentResult.agentId}]`)} ${pc.red("error")}`);
        console.log(pc.red(agentResult.error ?? "unknown error"));
      } else if (agentResult.response) {
        hadSuccess = true;
        console.log(pc.dim("─".repeat(60)));
        console.log(pc.bold(`[${agentResult.agentId}]`));
        console.log(agentResult.response);
      }
    }

    const totalIn = executed.totalInputTokens;
    const totalOut = executed.totalOutputTokens;
    const cost = (totalIn * 3 + totalOut * 15) / 1_000_000;
    console.log(pc.dim(`Tokens: ${totalIn}in/${totalOut}out | Cost: $${cost.toFixed(4)}`));

    await sessionMgr.delete(session.id);
    await sessionMgr.shutdown();
    return { exitCode: hadSuccess ? 0 : 1 };
  } finally {
    if (process.cwd() !== originalCwd) process.chdir(originalCwd);
  }
}
