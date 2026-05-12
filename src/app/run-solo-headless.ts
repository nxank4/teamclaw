/**
 * Headless solo runner — single-agent run with no TUI.
 *
 * Ported from the old `runHeadless`/`runSolo` pair in headless.ts.
 * Invoked from print mode (`openpawl -p "<goal>"`).
 */

import pc from "picocolors";
import { ICONS } from "../tui/constants/icons.js";
import { formatDuration, formatToolTarget } from "../utils/formatters.js";
import { ToolEvent } from "../router/event-types.js";
import { createSessionManager } from "../session/index.js";
import { PromptRouter } from "../router/index.js";
import { createLLMAgentRunner } from "../router/llm-agent-runner.js";
import { ToolRegistry } from "../tools/registry.js";
import { ToolExecutor } from "../tools/executor.js";
import { PermissionResolver } from "../tools/permissions.js";
import { registerBuiltInTools } from "../tools/built-in/index.js";

export interface RunSoloHeadlessArgs {
  goal: string;
  /** Defaults to process.cwd(). */
  workdir?: string;
}

export interface HeadlessResult {
  exitCode: number;
}

export async function runSoloHeadless(args: RunSoloHeadlessArgs): Promise<HeadlessResult> {
  const workdir = args.workdir ?? process.cwd();

  // Per-run cwd switch so agent tool calls (file_write etc.) target workdir.
  const originalCwd = process.cwd();
  if (workdir !== originalCwd) process.chdir(workdir);

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

    let currentAgent = "";
    let tokenCount = 0;
    const agentStartTimes = new Map<string, number>();

    const agentRunner = createLLMAgentRunner({
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
      onToolCall: (_agentId, toolName, status, details) => {
        if (status === "running") {
          const target = formatToolTarget(details?.inputSummary as string | undefined);
          const label = target ? `${toolName} ${target}` : toolName;
          process.stdout.write(`\n    ${pc.dim(label)}`);
        } else if (status === "completed") {
          process.stdout.write(pc.dim(` ${ICONS.success}`));
        } else if (status === "failed") {
          process.stdout.write(pc.red(` ${ICONS.error}`));
        }
      },
      getToolSchemas: (toolNames) => toolReg.exportForLLM(toolNames),
      getNativeTools: (toolNames) => toolReg.exportForAPI(toolNames),
      executeTool: async (toolName, toolArgs) => {
        const result = await toolExec.execute(toolName, toolArgs, {
          sessionId: session.id,
          agentId: "agent",
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
    });

    const router = new PromptRouter(
      { defaultAgent: "assistant" },
      sessionMgr,
      null,
      agentRunner,
    );

    if (process.env.OPENPAWL_DEBUG) {
      const { wireDebugToRouter } = await import("../debug/wiring.js");
      wireDebugToRouter(router);
    }

    const result = await router.route(session.id, args.goal);

    if (currentAgent) {
      const elapsed = Date.now() - (agentStartTimes.get(currentAgent) ?? Date.now());
      process.stdout.write(
        ` ${pc.dim("→")} ${pc.green("done")} (${formatDuration(elapsed)}, ${tokenCount} tokens)\n`,
      );
    }

    if (result.isErr()) {
      console.error(`\n${pc.red("Error:")} ${result.error.type}`);
      if ("message" in result.error) {
        console.error(`  ${(result.error as { message: string }).message}`);
      }
      await sessionMgr.delete(session.id);
      await sessionMgr.shutdown();
      return { exitCode: 1 };
    }

    const dispatch = result.value;
    console.log("");
    for (const agentResult of dispatch.agentResults) {
      if (agentResult.error) {
        console.log(pc.dim("─".repeat(60)));
        console.log(`${pc.bold(`[${agentResult.agentId}]`)} ${pc.red("error")}`);
        console.log(pc.red(agentResult.error));
      } else if (agentResult.response) {
        console.log(pc.dim("─".repeat(60)));
        console.log(pc.bold(`[${agentResult.agentId}]`));
        console.log(agentResult.response);
      }
    }

    const totalIn = dispatch.totalInputTokens;
    const totalOut = dispatch.totalOutputTokens;
    const cost = (totalIn * 3 + totalOut * 15) / 1_000_000;
    console.log(pc.dim(`Tokens: ${totalIn}in/${totalOut}out | Cost: $${cost.toFixed(4)}`));

    await sessionMgr.delete(session.id);
    await sessionMgr.shutdown();
    return { exitCode: 0 };
  } finally {
    if (process.cwd() !== originalCwd) process.chdir(originalCwd);
  }
}
