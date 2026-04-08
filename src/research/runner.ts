/**
 * Research runner — main optimization loop orchestrator.
 *
 * Measures a metric, proposes changes via AI, assesses results,
 * keeps improvements and reverts regressions. All on a git branch.
 */

import { ResearchGitManager } from "./git-manager.js";
import { measureMetric } from "./metric.js";
import { assess } from "./assessor.js";
import { proposeChange } from "./change-agent.js";
import { generateReport } from "./reporter.js";
import type {
  ResearchConfig,
  ResearchState,
  ResearchResult,
  ResearchEvent,
  Iteration,
} from "./types.js";
import { logger } from "../core/logger.js";

export class ResearchRunner {
  private state: ResearchState;
  private git: ResearchGitManager;
  private onEvent?: (event: ResearchEvent) => void;
  private abortController = new AbortController();

  constructor(config: ResearchConfig, onEvent?: (event: ResearchEvent) => void) {
    this.git = new ResearchGitManager(config.name);
    this.onEvent = onEvent;
    this.state = {
      config,
      status: "running",
      branch: this.git.branch,
      baseline: 0,
      bestScore: 0,
      currentIteration: 0,
      iterations: [],
      consecutiveRegressions: 0,
      startedAt: Date.now(),
    };
  }

  async run(): Promise<ResearchResult> {
    const config = this.state.config;

    // Create research branch
    try {
      this.git.createBranch();
    } catch (err) {
      this.emit({ type: "error", message: `Failed to create branch: ${err}` });
      return this.buildResult();
    }

    // Measure baseline
    try {
      this.state.baseline = config.metric.baseline ?? measureMetric(config.metric);
      this.state.bestScore = this.state.baseline;
      this.emit({ type: "started", config, baseline: this.state.baseline });
    } catch (err) {
      this.emit({ type: "error", message: `Baseline measurement failed: ${err}` });
      this.git.returnToOriginal();
      return this.buildResult();
    }

    // Main loop
    for (let i = 0; i < config.constraints.maxIterations; i++) {
      if (this.abortController.signal.aborted) break;
      if (this.state.status === "stopped") break;

      // Check timeout
      if (Date.now() - this.state.startedAt > config.constraints.timeoutMs) {
        logger.info("Research timeout reached");
        break;
      }

      // Handle pause
      while (this.state.status === "paused") {
        await new Promise((r) => setTimeout(r, 500));
        if (this.abortController.signal.aborted) break;
      }

      // Check consecutive regressions
      if (this.state.consecutiveRegressions >= config.constraints.maxRegressionsBeforeStop) {
        logger.info(`Stopping: ${this.state.consecutiveRegressions} consecutive regressions`);
        break;
      }

      this.state.currentIteration = i + 1;
      this.emit({ type: "iteration_start", index: i + 1 });

      const iteration = await this.runIteration(i + 1);
      this.state.iterations.push(iteration);
      this.emit({ type: "iteration_end", iteration });

      if (iteration.kept) {
        this.state.consecutiveRegressions = 0;
      } else {
        this.state.consecutiveRegressions++;
      }
    }

    // Return to original branch (research branch preserved for review)
    this.git.returnToOriginal();

    this.state.status = "completed";
    const result = this.buildResult();
    this.emit({ type: "completed", result });
    return result;
  }

  private async runIteration(index: number): Promise<Iteration> {
    const startTime = Date.now();
    const config = this.state.config;

    // 1. AI proposes a change
    let proposal;
    try {
      proposal = await proposeChange(
        config,
        this.state.bestScore,
        this.state.bestScore,
        this.state.iterations,
      );
    } catch (err) {
      return {
        index,
        description: "Failed to propose change",
        scoreBefore: this.state.bestScore,
        scoreAfter: this.state.bestScore,
        delta: 0,
        kept: false,
        reason: `AI proposal failed: ${err}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Commit the proposed change (so we can revert cleanly)
    try {
      this.git.commit(proposal.description);
    } catch {
      // Nothing to commit — AI didn't make any file changes
      return {
        index,
        description: proposal.description,
        scoreBefore: this.state.bestScore,
        scoreAfter: this.state.bestScore,
        delta: 0,
        kept: false,
        reason: "No file changes were made",
        durationMs: Date.now() - startTime,
      };
    }

    // 3. Assess the change
    const assessment = assess(config.metric, config.assess);
    const scoreBefore = this.state.bestScore;
    const scoreAfter = assessment.metricValue;
    const delta = scoreAfter - scoreBefore;
    const improved = config.metric.direction === "maximize"
      ? delta > 0
      : delta < 0;
    const checksPass = assessment.testsPassed && assessment.lintPassed && assessment.typecheckPassed;

    // 4. Keep or revert
    if (improved && (!config.constraints.requireTestPass || checksPass)) {
      this.state.bestScore = scoreAfter;
      return {
        index,
        description: proposal.description,
        scoreBefore,
        scoreAfter,
        delta,
        kept: true,
        durationMs: Date.now() - startTime,
      };
    }

    // Revert
    this.git.revertLast();
    return {
      index,
      description: proposal.description,
      scoreBefore,
      scoreAfter,
      delta,
      kept: false,
      reason: !checksPass ? assessment.error : "Metric regressed",
      durationMs: Date.now() - startTime,
    };
  }

  /** Pause the research loop. */
  pause(): void {
    this.state.status = "paused";
    this.emit({ type: "paused" });
  }

  /** Resume the research loop. */
  resume(): void {
    this.state.status = "running";
    this.emit({ type: "resumed" });
  }

  /** Stop the research loop. */
  stop(): ResearchResult {
    this.state.status = "stopped";
    this.abortController.abort();
    const result = this.buildResult();
    this.emit({ type: "stopped", result });
    return result;
  }

  /** Get current state for status display. */
  getState(): Readonly<ResearchState> {
    return this.state;
  }

  /** Generate a summary report. */
  getReport(): string {
    return generateReport(this.buildResult());
  }

  private buildResult(): ResearchResult {
    return {
      config: this.state.config,
      baseline: this.state.baseline,
      finalScore: this.state.bestScore,
      totalIterations: this.state.iterations.length,
      keptChanges: this.state.iterations.filter((i) => i.kept).length,
      revertedChanges: this.state.iterations.filter((i) => !i.kept).length,
      durationMs: Date.now() - this.state.startedAt,
      iterations: this.state.iterations,
    };
  }

  private emit(event: ResearchEvent): void {
    this.onEvent?.(event);
  }
}
