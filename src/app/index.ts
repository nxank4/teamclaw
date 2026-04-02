/**
 * OpenPawl TUI application entry point.
 * Launched when user runs `openpawl` with no subcommand.
 */

import { createLayout } from "./layout.js";
import {
  CommandRegistry,
  parseInput,
  createBuiltinCommands,
  type Terminal,
} from "../tui/index.js";
import { registerAllCommands } from "./commands/index.js";
import { SessionManager } from "./session.js";
import { createAutocompleteProvider } from "./autocomplete.js";
import { resolveFileRef } from "./file-ref.js";
import { executeShell } from "./shell.js";
import { detectConfig, showConfigWarning } from "./config-check.js";
import { setLoggerMuted } from "../core/logger.js";
import { defaultTheme } from "../tui/themes/default.js";

import type { AppLayout } from "./layout.js";

// ---------------------------------------------------------------------------
// Intent classification — decide if user input should invoke the work pipeline
// ---------------------------------------------------------------------------

function isWorkGoal(prompt: string): boolean {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;

  if (wordCount < 4) return false;

  // Has action verbs → likely a work goal
  if (/\b(build|create|implement|add|fix|refactor|update|write|design|setup|configure|deploy|migrate|optimize|remove|delete|change|move|integrate|convert|generate|scaffold|extract)\b/i.test(lower)) return true;

  // Long enough and not caught above → treat as work goal
  if (wordCount >= 8) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Handle natural language input — route based on intent
// ---------------------------------------------------------------------------

async function handleChat(
  text: string,
  layout: AppLayout,
  ctx: { addMessage: (role: string, content: string) => void },
): Promise<void> {
  layout.statusBar.updateSegment(3, "thinking...", defaultTheme.statusWorking);
  layout.tui.requestRender();

  try {
    const { callLLM } = await import("../engine/llm.js");
    layout.messages.addMessage({ role: "assistant", content: "", timestamp: new Date() });

    await callLLM(text, {
      systemPrompt: "You are OpenPawl, a helpful AI assistant running in a terminal. " +
        "Respond naturally and concisely. Use markdown formatting when helpful.",
      onChunk: (chunk: string) => {
        layout.messages.appendToLast(chunk);
        layout.tui.requestRender();
      },
    });
  } catch (err) {
    const { translateError } = await import("../engine/errors.js");
    const { setLastError } = await import("./commands/error.js");
    const opError = translateError(err);
    setLastError(opError);

    const lines: string[] = [`\u2717 ${opError.userMessage}`];
    if (opError.quickFixes.length > 0) {
      lines.push("");
      for (const fix of opError.quickFixes) {
        if (fix.command) lines.push(`  ${fix.command.padEnd(35)} ${fix.description}`);
        else lines.push(`  \u2022 ${fix.description}`);
      }
    }
    lines.push("");
    lines.push("  Type /error for technical details");
    ctx.addMessage("error", lines.join("\n"));
  } finally {
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();
  }
}

async function handleNaturalInput(
  text: string,
  layout: AppLayout,
  ctx: { addMessage: (role: string, content: string) => void },
): Promise<void> {
  // Non-work inputs → direct LLM chat response
  if (!isWorkGoal(text)) {
    await handleChat(text, layout, ctx);
    return;
  }

  // Work goal → start the agent pipeline
  const { workerEvents } = await import("../core/worker-events.js");

  let streamingActive = false;
  const onChunk = (data: { botId: string; chunk: string }) => {
    if (!streamingActive) {
      layout.messages.addMessage({ role: "assistant", content: "", timestamp: new Date() });
      streamingActive = true;
    }
    layout.messages.appendToLast(data.chunk);
    layout.tui.requestRender();
  };
  const onReasoning = (data: { botId: string; reasoning: string }) => {
    const preview = data.reasoning.slice(0, 200).replace(/\n/g, " ");
    layout.messages.addMessage({
      role: "agent",
      agentName: data.botId,
      content: `thinking: ${preview}${data.reasoning.length > 200 ? "..." : ""}`,
      timestamp: new Date(),
    });
    layout.tui.requestRender();
  };

  workerEvents.on("stream-chunk", onChunk);
  workerEvents.on("reasoning", onReasoning);

  layout.statusBar.updateSegment(3, "working", defaultTheme.statusWorking);
  layout.tui.requestRender();

  // Suppress @clack/prompts stdout output — it conflicts with the TUI renderer.
  // We capture clack's terminal writes and route them to Messages instead.
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const suppressClack = () => {
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString();
      // Clack output contains box-drawing chars (◇│├└┌┐) — redirect to messages
      if (/[◇│├└┌┐◆●○◒◐◓◑]/.test(str) || str.includes("\x1b[2K")) {
        // Strip ANSI, trim, skip empty
        const clean = str.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
        if (clean) {
          layout.messages.addMessage({ role: "system", content: clean, timestamp: new Date() });
          layout.tui.requestRender();
        }
        return true;
      }
      return origStdoutWrite(chunk);
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString();
      if (/[◇│├└┌┐◆●○◒◐◓◑]/.test(str) || str.includes("\x1b[2K")) {
        return true; // suppress spinner updates
      }
      return origStderrWrite(chunk);
    }) as typeof process.stderr.write;
  };
  const restoreStdout = () => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  };

  suppressClack();

  try {
    const { runWork } = await import("../work-runner.js");
    // Pass noWeb + noInteractive to skip clack interactive prompts
    await runWork({ goal: text.trim(), noWeb: true, args: ["--no-interactive", "--no-briefing"] });
    streamingActive = false;
    ctx.addMessage("system", "Done.");
  } catch (err) {
    streamingActive = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === "UserCancelError") {
      ctx.addMessage("system", "Cancelled.");
    } else {
      ctx.addMessage("error", `Failed: ${msg}`);
    }
  } finally {
    restoreStdout();
    workerEvents.off("stream-chunk", onChunk);
    workerEvents.off("reasoning", onReasoning);
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();
  }
}

export interface LaunchOptions {
  /** Custom terminal for testing (VirtualTerminal). */
  terminal?: Terminal;
  /** Custom sessions directory for testing. */
  sessionsDir?: string;
  /** Resume the most recent TUI session. */
  resume?: boolean;
}

/**
 * Launch the interactive TUI.
 * Blocks until the user exits (Ctrl+C, /quit, Ctrl+D).
 */
export async function launchTUI(opts?: LaunchOptions): Promise<void> {
  // Suppress logger during TUI — all messages go through layout.showSystemMessage
  setLoggerMuted(true);

  const layout = createLayout(opts?.terminal);
  const registry = new CommandRegistry();
  const session = new SessionManager(opts?.sessionsDir);

  // Register built-in commands (/help, /clear, /quit)
  for (const cmd of createBuiltinCommands(() => registry)) {
    registry.register(cmd);
  }

  // Register control commands (natural language goes to agent pipeline)
  registerAllCommands(registry, session);

  // Set up autocomplete
  layout.editor.setAutocompleteProvider(
    createAutocompleteProvider(registry, process.cwd()),
  );

  // Handle editor submit
  layout.editor.onSubmit = async (text: string) => {
    layout.editor.pushHistory(text);
    const parsed = parseInput(text);

    const ctx = {
      addMessage: (role: string, content: string) => {
        layout.messages.addMessage({
          role: role as "system" | "user" | "error" | "assistant" | "agent" | "tool",
          content,
          timestamp: new Date(),
        });
        session.append({ role, content });
        layout.tui.requestRender();
      },
      requestRender: () => layout.tui.requestRender(),
      exit: () => {
        session.close();
        layout.tui.stop();
      },
      tui: layout.tui,
    };

    switch (parsed.type) {
      case "command": {
        if (!parsed.name) {
          ctx.addMessage("error", "Type a command name after /. Try /help for a list.");
          break;
        }
        const result = registry.lookup(`/${parsed.name} ${parsed.args}`);
        if (result) {
          await result.command.execute(result.args, ctx);
        } else {
          ctx.addMessage("error", `Unknown command: /${parsed.name}. Type /help for commands.`);
        }
        break;
      }

      case "shell": {
        ctx.addMessage("system", `$ ${parsed.command}`);
        layout.messages.addMessage({ role: "tool", content: "", timestamp: new Date() });
        await executeShell(parsed.command, (chunk) => {
          layout.messages.appendToLast(chunk);
          layout.tui.requestRender();
        });
        break;
      }

      case "file_ref": {
        const file = resolveFileRef(parsed.path, process.cwd());
        if ("error" in file) {
          ctx.addMessage("error", file.error);
        } else {
          ctx.addMessage("system", `📎 ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
        }
        break;
      }

      case "message": {
        // Natural language → send to agent pipeline
        ctx.addMessage("user", text);
        await handleNaturalInput(text, layout, ctx);
        break;
      }
    }
  };

  // Welcome message — appears as the first chat message, scrolls away naturally
  let versionStr = "0.0.1";
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version: string };
    versionStr = pkg.version;
  } catch {
    // Use default version
  }
  layout.messages.addMessage({
    role: "system",
    content: [
      `\u2726  O P E N P A W L  v${versionStr}`,
      "",
      "Terminal-native AI workspace. Just type what you want to build.",
      "",
      "  /help       Show commands",
      "  /settings   Configure provider & model",
      "  /status     Check connection",
      "  !command    Run a shell command",
      "  @file       Reference a file",
    ].join("\n"),
    timestamp: new Date(),
  });
  // Detect provider configuration and update status bar
  layout.statusBar.setSegments([
    { text: "no provider", color: defaultTheme.dim },
    { text: "\u25cb not configured", color: defaultTheme.error },
    { text: "auto", color: defaultTheme.statusMode },
    { text: "idle", color: defaultTheme.dim },
    { text: "$0.00", color: defaultTheme.success },
  ]);
  layout.statusBar.setRightText("/help");

  const configState = await detectConfig();
  if (configState.hasProvider) {
    layout.statusBar.updateSegment(0, configState.providerName);
    if (configState.isConnected) {
      layout.statusBar.updateSegment(1, "\u25cf connected", defaultTheme.success);
    } else {
      layout.statusBar.updateSegment(1, "\u25cb disconnected", defaultTheme.error);
    }
  }
  showConfigWarning(configState, layout);

  // TUI callbacks
  layout.tui.onSystemMessage = (msg: string) => {
    layout.messages.addMessage({ role: "system", content: msg, timestamp: new Date() });
    layout.tui.requestRender();
  };

  const cleanup = () => {
    session.close();
    layout.tui.stop();
    setLoggerMuted(false);
  };
  layout.tui.onExit = cleanup;

  // Start the TUI
  layout.tui.start();

  // Block until exit
  await new Promise<void>((resolve) => {
    const origExit = layout.tui.onExit;
    layout.tui.onExit = () => {
      origExit?.();
      resolve();
    };
  });
}

/**
 * Non-interactive print mode.
 * Runs a command and outputs the result to stdout, then exits.
 */
export async function runPrintMode(prompt: string): Promise<void> {
  const parsed = parseInput(prompt);

  if (parsed.type === "command" && parsed.name === "work") {
    // Reuse existing CLI work command
    const { runWork } = await import("../work-runner.js");
    await runWork({ goal: parsed.args.trim(), noWeb: true, args: [] });
    return;
  }

  if (parsed.type === "command" && parsed.name === "status") {
    const { getGlobalProviderManager } = await import("../providers/provider-factory.js");
    const pm = getGlobalProviderManager();
    for (const p of pm.getProviders()) {
      const ok = await p.healthCheck().catch(() => false);
      console.log(`${p.name}: ${p.isAvailable() ? "available" : "unavailable"} health=${ok ? "ok" : "fail"}`);
    }
    return;
  }

  // Default: treat as a work goal
  if (prompt.trim()) {
    const { runWork } = await import("../work-runner.js");
    await runWork({ goal: prompt.trim(), noWeb: true, args: [] });
    return;
  }

  console.log("Usage: openpawl -p <prompt>");
  console.log('  openpawl -p "/work build auth"');
  console.log('  openpawl -p "build auth"');
}
