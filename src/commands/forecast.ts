/**
 * CLI commands for cost forecasting.
 *
 * teamclaw forecast <goal>                 Forecast without starting a run
 * teamclaw forecast <goal> --runs 3        Multi-run projection
 * teamclaw forecast accuracy               Show forecast accuracy stats
 * teamclaw forecast accuracy --method historical  Per method breakdown
 */

import pc from "picocolors";
import { logger } from "../core/logger.js";
import { generateForecast } from "../forecast/engine.js";
import { getAccuracyStats, getAccuracyByMethod } from "../forecast/tracker.js";
import type { CostForecast } from "../forecast/types.js";
import type { PreviewTask } from "../graph/preview/types.js";

export async function runForecastCommand(args: string[]): Promise<void> {
  if (!args[0] || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  if (args[0] === "accuracy") {
    const methodIdx = args.indexOf("--method");
    const method = methodIdx >= 0 ? args[methodIdx + 1] : undefined;
    runAccuracyCommand(method);
    return;
  }

  // Treat first arg as goal
  const runsIdx = args.indexOf("--runs");
  const runs = runsIdx >= 0 ? parseInt(args[runsIdx + 1] ?? "1", 10) : 1;

  // Collect goal from args (everything that's not a flag)
  const goalParts = args.filter((a, i) => {
    if (a.startsWith("--")) return false;
    if (i > 0 && args[i - 1] === "--runs") return false;
    return true;
  });
  const goal = goalParts.join(" ");

  if (!goal.trim()) {
    logger.error("Usage: teamclaw forecast <goal>");
    process.exit(1);
  }

  // Get model from config
  let model = "claude-sonnet-4-6";
  try {
    const { readGlobalConfigWithDefaults } = await import("../core/global-config.js");
    const config = readGlobalConfigWithDefaults();
    model = config.model || model;
  } catch {
    // Use default
  }

  // Generate synthetic tasks from goal (simple decomposition)
  const tasks = generateSyntheticTasks(goal);

  const forecast = generateForecast({
    sessionId: "forecast-preview",
    goal,
    tasks,
    model,
    runs,
  });

  renderForecastCli(forecast);
}

function renderForecastCli(forecast: CostForecast): void {
  const border = "─".repeat(61);

  logger.plain("");
  logger.plain(pc.bold(pc.cyan("┌" + border + "┐")));
  logger.plain(pc.bold(pc.cyan("│ Cost Forecast" + " ".repeat(47) + "│")));
  logger.plain(pc.bold(pc.cyan("├" + border + "┤")));

  // Estimated total
  const confBadge = forecast.confidenceLevel === "high" ? pc.green("High") :
    forecast.confidenceLevel === "medium" ? pc.yellow("Medium") : pc.red("Low");

  logger.plain(`│ Estimated total:     $${forecast.estimatedMinUSD.toFixed(2)} – $${forecast.estimatedMaxUSD.toFixed(2)}  (mid: $${forecast.estimatedMidUSD.toFixed(2)})`.padEnd(62) + "│");
  logger.plain(`│ Confidence:          ${confBadge} (${forecast.confidenceReason})`.padEnd(62) + "│");
  logger.plain("│" + " ".repeat(61) + "│");

  // By agent
  if (forecast.agentForecasts.length > 0) {
    logger.plain("│ " + pc.bold("By agent:") + " ".repeat(51) + "│");
    for (const af of forecast.agentForecasts) {
      const name = af.agentRole.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const range = `$${af.estimatedMinUSD.toFixed(2)} – $${af.estimatedMaxUSD.toFixed(2)}`;
      const tasks = `(${af.estimatedTasks} task${af.estimatedTasks !== 1 ? "s" : ""})`;
      logger.plain(`│   ${name.padEnd(20)} ${range.padEnd(18)} ${tasks}`.padEnd(62) + "│");
    }
    logger.plain("│" + " ".repeat(61) + "│");
  }

  // By phase
  if (forecast.phaseForecasts.length > 0) {
    logger.plain("│ " + pc.bold("By phase:") + " ".repeat(51) + "│");
    for (const pf of forecast.phaseForecasts) {
      const name = pf.phase.charAt(0).toUpperCase() + pf.phase.slice(1);
      const range = `$${pf.estimatedMinUSD.toFixed(3)} – $${pf.estimatedMaxUSD.toFixed(3)}`;
      logger.plain(`│   ${name.padEnd(20)} ${range}`.padEnd(62) + "│");
    }
    logger.plain("│" + " ".repeat(61) + "│");
  }

  // Similar past runs
  if (forecast.similarRunsCount > 0) {
    logger.plain(`│ Similar past runs:   avg $${forecast.similarRunsAvgCost.toFixed(2)}, range $${forecast.similarRunsRange.min.toFixed(2)}–$${forecast.similarRunsRange.max.toFixed(2)}`.padEnd(62) + "│");
  }

  logger.plain(`│ Model:               ${forecast.agentForecasts[0]?.model ?? "unknown"}`.padEnd(62) + "│");

  // Multi-run projection
  if (forecast.multiRunProjection.runs > 1) {
    const proj = forecast.multiRunProjection;
    logger.plain("│" + " ".repeat(61) + "│");
    logger.plain(`│ Multi-run savings:   --runs ${proj.runs} estimated $${proj.projectedCost.toFixed(2)} (-${proj.savingsPct}% vs ${proj.runs}x)`.padEnd(62) + "│");
  }

  // Model suggestions
  if (forecast.modelSuggestions.length > 0) {
    logger.plain("│" + " ".repeat(61) + "│");
    logger.plain("│ " + pc.bold("Model suggestions:") + " ".repeat(42) + "│");
    for (const ms of forecast.modelSuggestions) {
      const action = ms.recommendation === "switch" ? pc.green("Switch") : pc.yellow("Consider");
      logger.plain(`│   ${action} ${ms.agentRole}: ${ms.currentModel} → ${ms.suggestedModel} (-${ms.estimatedSavingsPct}%)`.padEnd(62) + "│");
    }
  }

  logger.plain(pc.bold(pc.cyan("└" + border + "┘")));
  logger.plain(`  Method: ${forecast.forecastMethod} | ${forecast.confidenceReason}`);
  logger.plain("");
}

function runAccuracyCommand(method?: string): void {
  if (method) {
    const entries = getAccuracyByMethod(method);
    if (entries.length === 0) {
      logger.plain(`No accuracy data for method: ${method}`);
      return;
    }

    logger.plain(pc.bold(`Forecast Accuracy — ${method}`));
    logger.plain("─".repeat(60));
    logger.plain(
      "Session".padEnd(25) +
      "Estimated".padEnd(12) +
      "Actual".padEnd(12) +
      "Error %",
    );
    logger.plain("─".repeat(60));

    for (const e of entries.slice(-20)) {
      logger.plain(
        e.sessionId.slice(0, 24).padEnd(25) +
        `$${e.estimatedMidUSD.toFixed(3)}`.padEnd(12) +
        `$${e.actualUSD.toFixed(3)}`.padEnd(12) +
        `${e.errorPct}%`,
      );
    }
    return;
  }

  const stats = getAccuracyStats();
  if (stats.totalForecasts === 0) {
    logger.plain("No forecast accuracy data yet. Forecasts will be tracked after runs complete.");
    return;
  }

  logger.plain(pc.bold("Forecast Accuracy Summary"));
  logger.plain("─".repeat(40));
  logger.plain(`Total forecasts:  ${stats.totalForecasts}`);
  logger.plain(`Average error:    ${stats.avgErrorPct}%`);
  logger.plain("");

  if (stats.byMethod.length > 0) {
    logger.plain(pc.bold("By method:"));
    for (const m of stats.byMethod) {
      logger.plain(`  ${m.method.padEnd(16)} ${m.count} forecasts, avg error ${m.avgErrorPct}%`);
    }
  }
}

/** Generate synthetic tasks from a goal for standalone forecasting. */
function generateSyntheticTasks(goal: string): PreviewTask[] {
  const lower = goal.toLowerCase();
  const tasks: PreviewTask[] = [];

  // Simple decomposition based on keywords
  const hasResearch = lower.includes("research") || lower.includes("investigate") || lower.includes("analyze");
  const hasDesign = lower.includes("design") || lower.includes("architect") || lower.includes("rfc");
  const hasImplement = lower.includes("implement") || lower.includes("build") || lower.includes("create") || lower.includes("refactor");
  const hasTest = lower.includes("test") || lower.includes("validate");

  let id = 1;

  if (hasResearch) {
    tasks.push({ task_id: `t-${id++}`, description: "Research and analyze requirements", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] });
  }

  if (hasDesign) {
    tasks.push({ task_id: `t-${id++}`, description: "Draft system design / RFC", assigned_to: "worker_task", complexity: "HIGH", dependencies: tasks.length > 0 ? [`t-${id - 2}`] : [] });
  }

  // Default: at least 2 implementation tasks
  if (hasImplement || (!hasResearch && !hasDesign && !hasTest)) {
    tasks.push({ task_id: `t-${id++}`, description: "Implement core logic", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: tasks.length > 0 ? [`t-${id - 2}`] : [] });
    tasks.push({ task_id: `t-${id++}`, description: "Implement secondary changes", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [`t-${id - 2}`] });
  }

  if (hasTest) {
    tasks.push({ task_id: `t-${id++}`, description: "Write tests and validate", assigned_to: "worker_task", complexity: "LOW", dependencies: [`t-${id - 2}`] });
  }

  // Ensure at least 2 tasks
  if (tasks.length < 2) {
    tasks.push({ task_id: `t-${id++}`, description: "Execute primary goal task", assigned_to: "worker_task", complexity: "MEDIUM", dependencies: [] });
    tasks.push({ task_id: `t-${id++}`, description: "Review and finalize", assigned_to: "worker_task", complexity: "LOW", dependencies: [`t-${id - 2}`] });
  }

  return tasks;
}

function printHelp(): void {
  const lines = [
    "",
    pc.bold("teamclaw forecast") + " — Estimate run cost before execution",
    "",
    pc.bold("Usage:"),
    "  " + pc.green('teamclaw forecast "<goal>"') + "            Standalone forecast",
    "  " + pc.green('teamclaw forecast "<goal>" --runs 3') + "   Multi-run projection",
    "  " + pc.green("teamclaw forecast accuracy") + "            Show accuracy stats",
    "",
    pc.bold("Options:"),
    "  " + pc.green("--runs <N>") + "           Number of runs to project",
    "  " + pc.green("--method <method>") + "    Filter accuracy by method (historical, profile_based, heuristic)",
    "",
    "Examples:",
    pc.dim('  teamclaw forecast "Refactor auth module to use OAuth2"'),
    pc.dim('  teamclaw forecast "Build REST API" --runs 3'),
    pc.dim("  teamclaw forecast accuracy"),
    "",
  ];
  console.log(lines.join("\n"));
}
