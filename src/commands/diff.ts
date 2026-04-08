/**
 * CLI commands for goal diff between runs and sessions.
 *
 * openpawl diff <sessionId>                     Diff all runs in session
 * openpawl diff <sessionId> --runs 1,2          Diff specific run pair
 * openpawl diff <sessionId1> <sessionId2>       Cross-session diff
 * openpawl diff <sessionId> --verbose           Show unchanged tasks
 * openpawl diff <sessionId> --format markdown   Export as markdown
 * openpawl diff <sessionId> --output <dir>      Custom output directory
 * openpawl diff <sessionId> --summary           Overall trend only
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { logger } from "../core/logger.js";
import { getSession } from "../replay/session-index.js";
import { readRecordingEvents } from "../replay/storage.js";
import { extractRunSnapshot } from "../diff/engine.js";
import { buildDiffChain, buildPairDiff } from "../diff/chain.js";
import { renderDiffCli, renderOverallTrend } from "../diff/renderers/cli.js";
import { renderDiffMarkdown } from "../diff/renderers/markdown.js";
import type { RunSnapshot, DiffChain, ConfigDifference } from "../diff/types.js";
import type { RecordingEvent } from "../replay/types.js";

export async function runDiffCommand(args: string[]): Promise<void> {
  if (!args[0] || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  // Parse flags
  const verbose = args.includes("--verbose");
  const summaryOnly = args.includes("--summary");
  const formatIdx = args.indexOf("--format");
  const format = formatIdx >= 0 ? (args[formatIdx + 1] ?? "cli") : "cli";
  const outputIdx = args.indexOf("--output");
  const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : undefined;
  const runsIdx = args.indexOf("--runs");
  const runsPair = runsIdx >= 0 ? args[runsIdx + 1] : undefined;

  // Simple: first non-flag arg is sessionId, second (if any) is second sessionId
  const sessionId1 = args[0];
  const secondArg = args[1];
  const isCrossSession = secondArg && !secondArg.startsWith("--") &&
    args.indexOf(secondArg) === 1 &&
    !["--format", "--output", "--runs", "--verbose", "--summary"].includes(args[0]);

  if (isCrossSession) {
    await runCrossSessionDiff(sessionId1, secondArg, { verbose, format, outputDir });
    return;
  }

  const session = getSession(sessionId1);
  if (!session) {
    logger.error(`Session not found: ${sessionId1}`);
    process.exit(1);
  }

  if (session.totalRuns < 2 && !runsPair) {
    logger.error(`Session ${sessionId1} has only ${session.totalRuns} run(s). Need at least 2 runs to diff.`);
    process.exit(1);
  }

  // Build snapshots from recording events
  const events = await readRecordingEvents(sessionId1);
  const maxRun = session.totalRuns;

  if (runsPair) {
    // Specific run pair: --runs 1,2
    const parts = runsPair.split(",").map((s) => parseInt(s.trim(), 10));
    if (parts.length !== 2 || parts.some(isNaN)) {
      logger.error("--runs must be two comma-separated run numbers, e.g. --runs 1,2");
      process.exit(1);
    }
    const [fromRun, toRun] = parts;
    const fromSnapshot = buildSnapshotFromEvents(sessionId1, fromRun, events);
    const toSnapshot = buildSnapshotFromEvents(sessionId1, toRun, events);
    const chain = buildPairDiff(fromSnapshot, toSnapshot);
    outputChain(chain, { verbose, summaryOnly, format, outputDir, sessionId: sessionId1 });
    return;
  }

  // All runs
  const snapshots: RunSnapshot[] = [];
  for (let i = 1; i <= maxRun; i++) {
    snapshots.push(buildSnapshotFromEvents(sessionId1, i, events));
  }

  const chain = buildDiffChain(snapshots);
  await outputChain(chain, { verbose, summaryOnly, format, outputDir, sessionId: sessionId1 });
}

async function runCrossSessionDiff(
  sessionIdA: string,
  sessionIdB: string,
  options: { verbose: boolean; format: string; outputDir?: string },
): Promise<void> {
  const sessionA = getSession(sessionIdA);
  const sessionB = getSession(sessionIdB);
  if (!sessionA) { logger.error(`Session not found: ${sessionIdA}`); process.exit(1); }
  if (!sessionB) { logger.error(`Session not found: ${sessionIdB}`); process.exit(1); }

  const eventsA = await readRecordingEvents(sessionIdA);
  const eventsB = await readRecordingEvents(sessionIdB);

  // Compare last run of each session
  const snapshotA = buildSnapshotFromEvents(sessionIdA, sessionA.totalRuns || 1, eventsA);
  const snapshotB = buildSnapshotFromEvents(sessionIdB, sessionB.totalRuns || 1, eventsB);

  const chain = buildPairDiff(snapshotA, snapshotB);

  // Add cross-session context
  const configDiffs: ConfigDifference[] = [];
  if (!sessionA.teamComposition || !sessionB.teamComposition ||
      JSON.stringify(sessionA.teamComposition.sort()) !== JSON.stringify(sessionB.teamComposition.sort())) {
    configDiffs.push({
      key: "teamComposition",
      valueA: (sessionA.teamComposition ?? []).join(", "),
      valueB: (sessionB.teamComposition ?? []).join(", "),
    });
  }
  if (sessionA.goal !== sessionB.goal) {
    configDiffs.push({
      key: "goal",
      valueA: sessionA.goal,
      valueB: sessionB.goal,
    });
  }

  if (options.format === "markdown") {
    let md = renderDiffMarkdown(chain);
    if (configDiffs.length > 0) {
      md += "\n\n## Config Differences\n\n";
      md += "| Key | Session A | Session B |\n";
      md += "|-----|-----------|----------|\n";
      for (const d of configDiffs) {
        md += `| ${d.key} | ${d.valueA} | ${d.valueB} |\n`;
      }
    }
    if (options.outputDir) {
      await mkdir(options.outputDir, { recursive: true });
      const outPath = path.join(options.outputDir, `diff-${sessionIdA}-vs-${sessionIdB}.md`);
      await writeFile(outPath, md, "utf-8");
      logger.success(`Diff exported: ${outPath}`);
    } else {
      logger.plain(md);
    }
  } else {
    let output = renderDiffCli(chain, { verbose: options.verbose });
    if (configDiffs.length > 0) {
      output += "\n" + pc.bold("Config differences:") + "\n";
      for (const d of configDiffs) {
        output += `  ${d.key}: ${pc.red(d.valueA)} → ${pc.green(d.valueB)}\n`;
      }
    }
    logger.plain(output);
  }
}

async function outputChain(
  chain: DiffChain,
  options: {
    verbose: boolean;
    summaryOnly: boolean;
    format: string;
    outputDir?: string;
    sessionId: string;
  },
): Promise<void> {
  if (options.format === "markdown") {
    const md = renderDiffMarkdown(chain);
    if (options.outputDir) {
      await mkdir(options.outputDir, { recursive: true });
      const outPath = path.join(options.outputDir, `diff-${options.sessionId}.md`);
      await writeFile(outPath, md, "utf-8");
      logger.success(`Diff exported: ${outPath}`);
    } else {
      logger.plain(md);
    }
    return;
  }

  // CLI output
  if (options.summaryOnly) {
    logger.plain(renderOverallTrend(chain));
    return;
  }

  logger.plain(renderDiffCli(chain, { verbose: options.verbose }));
}

/** Build a RunSnapshot from recording events for a specific run. */
function buildSnapshotFromEvents(
  sessionId: string,
  runIndex: number,
  allEvents: RecordingEvent[],
): RunSnapshot {
  const runEvents = allEvents.filter((e) => e.runIndex === runIndex);
  const exitEvents = runEvents.filter((e) => e.phase === "exit");

  // Get the last state snapshot
  const lastExit = exitEvents[exitEvents.length - 1];
  const state = lastExit?.stateAfter ?? {};

  // Timing
  const enterEvents = runEvents.filter((e) => e.phase === "enter");
  const startedAt = enterEvents[0]?.timestamp ?? 0;
  const completedAt = lastExit?.timestamp ?? startedAt;

  return extractRunSnapshot(sessionId, runIndex, state, startedAt, completedAt);
}

function printHelp(): void {
  const lines = [
    "",
    pc.bold("openpawl diff") + " — Compare runs within or across sessions",
    "",
    pc.bold("Usage:"),
    "  " + pc.green("openpawl diff <sessionId>") + "                  Diff all runs in session",
    "  " + pc.green("openpawl diff <sessionId> --runs 1,2") + "      Diff specific run pair",
    "  " + pc.green("openpawl diff <sess1> <sess2>") + "             Cross-session diff",
    "",
    pc.bold("Options:"),
    "  " + pc.green("--verbose") + "           Show unchanged tasks",
    "  " + pc.green("--format markdown") + "   Export as markdown (default: cli)",
    "  " + pc.green("--output <dir>") + "      Custom output directory",
    "  " + pc.green("--runs 1,2") + "          Specific run pair",
    "  " + pc.green("--summary") + "           Overall trend only",
    "",
    "Examples:",
    pc.dim("  openpawl diff sess_abc123"),
    pc.dim("  openpawl diff sess_abc123 --runs 1,2"),
    pc.dim("  openpawl diff sess_abc123 sess_def456"),
    pc.dim("  openpawl diff sess_abc123 --format markdown --output ./reports/"),
    "",
  ];
  console.log(lines.join("\n"));
}
