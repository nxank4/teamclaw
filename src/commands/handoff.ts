/**
 * CLI command for generating and importing CONTEXT.md handoff files.
 *
 * Usage:
 *   teamclaw handoff              — generate from last session
 *   teamclaw handoff --session X  — generate for specific session
 *   teamclaw handoff --out path   — custom output path
 *   teamclaw handoff --preview    — print to terminal only
 *   teamclaw handoff import       — import CONTEXT.md from cwd
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import pc from "picocolors";
import { logger } from "../core/logger.js";

export async function runHandoffCommand(args: string[]): Promise<void> {
  // Sub-command: import
  if (args[0] === "import") {
    await handleImport();
    return;
  }

  // Parse flags
  let sessionId: string | undefined;
  let outputPath: string | undefined;
  let preview = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--session" || arg === "-s") {
      sessionId = args[++i];
    } else if (arg.startsWith("--session=")) {
      sessionId = arg.slice("--session=".length);
    } else if (arg === "--out" || arg === "-o") {
      outputPath = args[++i];
    } else if (arg.startsWith("--out=")) {
      outputPath = arg.slice("--out=".length);
    } else if (arg === "--preview") {
      preview = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      return;
    }
  }

  await handleGenerate(sessionId, outputPath, preview);
}

function printUsage(): void {
  logger.plain("Usage: teamclaw handoff [options]");
  logger.plain("");
  logger.plain("Generate a CONTEXT.md handoff file from session data.");
  logger.plain("");
  logger.plain("Options:");
  logger.plain("  --session, -s <id>  Generate for a specific session");
  logger.plain("  --out, -o <path>    Custom output path (default: ./CONTEXT.md)");
  logger.plain("  --preview           Print to terminal instead of writing file");
  logger.plain("");
  logger.plain("Sub-commands:");
  logger.plain("  import              Import CONTEXT.md from current directory");
}

async function handleGenerate(
  sessionIdArg: string | undefined,
  outputPath: string | undefined,
  preview: boolean,
): Promise<void> {
  const { listSessions } = await import("../replay/session-index.js");
  const { readRecordingEvents } = await import("../replay/storage.js");
  const { buildHandoffData, renderContextMarkdown } = await import("../handoff/index.js");

  // Resolve session
  const sessions = listSessions(10);
  let targetSessionId = sessionIdArg;

  if (!targetSessionId) {
    const last = sessions[0];
    if (!last) {
      logger.error("No sessions found. Run a work session first.");
      process.exit(1);
    }
    targetSessionId = last.sessionId;
  }

  logger.info(`Generating handoff for session ${pc.cyan(targetSessionId)}...`);

  // Read recording events and extract final state
  let events;
  try {
    events = await readRecordingEvents(targetSessionId);
  } catch {
    logger.error(`Could not read recording for session "${targetSessionId}".`);
    process.exit(1);
  }

  const exitEvents = events.filter((e) => e.phase === "exit");
  const lastExit = exitEvents[exitEvents.length - 1];
  const finalState = lastExit?.stateAfter ?? {};

  const taskQueue = (finalState.task_queue ?? []) as Array<Record<string, unknown>>;
  const nextSprintBacklog = (finalState.next_sprint_backlog ?? []) as Array<Record<string, unknown>>;
  const promotedThisRun = (finalState.promoted_this_run ?? []) as string[];
  const agentProfiles = (finalState.agent_profiles ?? []) as Array<Record<string, unknown>>;
  const rfcDocument = (finalState.rfc_document as string) ?? null;
  const goal = (finalState.goal as string) ?? sessions.find((s) => s.sessionId === targetSessionId)?.goal ?? "(unknown goal)";

  // Retrieve active decisions (best-effort)
  let activeDecisions: import("../journal/types.js").Decision[] = [];
  try {
    const { VectorMemory } = await import("../core/knowledge-base.js");
    const { CONFIG } = await import("../core/config.js");
    const { DecisionStore } = await import("../journal/store.js");
    const { GlobalMemoryManager } = await import("../memory/global/store.js");

    const vm = new VectorMemory(CONFIG.vectorStorePath, CONFIG.memoryBackend);
    await vm.init();
    const embedder = vm.getEmbedder();
    if (embedder) {
      const gmm = new GlobalMemoryManager();
      await gmm.init(embedder);
      const db = gmm.getDb();
      if (db) {
        const store = new DecisionStore();
        await store.init(db);
        const recent = await store.getRecentDecisions(30);
        activeDecisions = recent.filter((d) => d.status === "active");
      }
    }
  } catch {
    // Non-critical
  }

  const data = buildHandoffData({
    sessionId: targetSessionId,
    projectPath: process.cwd(),
    goal,
    taskQueue,
    nextSprintBacklog,
    promotedThisRun,
    agentProfiles,
    activeDecisions: activeDecisions as never[],
    rfcDocument,
  });

  const markdown = renderContextMarkdown(data);

  if (preview) {
    logger.plain(markdown);
    return;
  }

  // Write output
  const { readGlobalConfigWithDefaults } = await import("../core/global-config.js");
  const config = readGlobalConfigWithDefaults();
  const handoffConfig = config.handoff;
  const dest = path.resolve(outputPath ?? handoffConfig?.outputPath ?? "./CONTEXT.md");

  const destDir = path.dirname(dest);
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }
  await writeFile(dest, markdown, "utf-8");
  logger.success(`Handoff written to ${pc.cyan(dest)}`);

  // Timestamped copy in session dir
  const sessionDir = path.join(os.homedir(), ".teamclaw", "sessions", targetSessionId);
  try {
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, "CONTEXT.md"), markdown, "utf-8");
  } catch {
    // Non-critical
  }

  // Git commit if configured
  if (handoffConfig?.gitCommit) {
    tryGitCommit(dest);
  }
}

function tryGitCommit(filePath: string): void {
  try {
    execSync(`git add "${filePath}"`, { stdio: "ignore" });
    execSync(`git commit -m "docs: auto-generate CONTEXT.md handoff"`, { stdio: "ignore" });
    logger.info("Committed CONTEXT.md to git.");
  } catch {
    // Never fail loudly
  }
}

async function handleImport(): Promise<void> {
  const { importContextFile } = await import("../handoff/importer.js");

  const contextPath = path.resolve("CONTEXT.md");
  if (!existsSync(contextPath)) {
    logger.error("No CONTEXT.md found in current directory.");
    process.exit(1);
  }

  logger.info(`Importing ${pc.cyan(contextPath)}...`);
  const result = await importContextFile(contextPath);

  if (!result) {
    logger.error("Failed to parse CONTEXT.md.");
    process.exit(1);
  }

  logger.success(`Imported: ${pc.bold(String(result.imported))} decisions`);
  if (result.skipped > 0) {
    logger.info(`Skipped: ${result.skipped} (already known)`);
  }
  if (result.currentState.length > 0) {
    logger.info(`Current state: ${result.currentState.length} items loaded`);
  }
  if (result.leftToDo.length > 0) {
    logger.info(`Left to do: ${result.leftToDo.length} items`);
    for (const item of result.leftToDo.slice(0, 5)) {
      logger.plain(`  ${pc.yellow("→")} ${item}`);
    }
  }
}
