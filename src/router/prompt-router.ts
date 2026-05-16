/**
 * Prompt Router — main entry point for user prompts.
 * Ties together: mention parsing → intent classification → route resolution → dispatch.
 */

import { EventEmitter } from "node:events";
import { Result, ok, err } from "neverthrow";
import os from "node:os";
import path from "node:path";
import { ContextTracker } from "../context/context-tracker.js";
import { compact, type CompactableMessage } from "../context/compaction.js";
import type { ContextLevel } from "../context/types.js";
import type {
  PromptIntent,
  RouteDecision,
  DispatchResult,
  RouterError,
} from "./router-types.js";
import { AgentRegistry } from "./agent-registry.js";
import { IntentClassifier } from "./intent-classifier.js";
import type { ClassifierLLM } from "./intent-classifier.js";
import { AgentResolver } from "./agent-resolver.js";
import { Dispatcher } from "./dispatch-strategy.js";
import type { AgentRunner } from "./dispatch-strategy.js";
import { RouterEvent, DISPATCH_EVENTS } from "./event-types.js";
import { parseMentions } from "./mention-parser.js";
import type { AppMode } from "../tui/keybindings/app-mode.js";
import type { SessionManager } from "../session/index.js";
import { runCrew, PLANNER_AGENT_ID } from "../crew/crew-runner.js";
import type { CrewRunResult, RunCrewArgs } from "../crew/crew-runner.js";
import { debugLog } from "../debug/logger.js";
import type { CrewPhase } from "../crew/types.js";
import { FULL_STACK_PRESET } from "../crew/manifest/index.js";
import { agentDisplayName } from "../app/agent-display.js";
import { formatTokens } from "../utils/formatters.js";
import { defaultTheme } from "../tui/themes/default.js";
import type { CheckpointCoordinator } from "../crew/checkpoints.js";
import { getActiveCheckpointCoordinator } from "../crew/checkpoint-registry.js";
import type { ToolExecutor } from "./agent-turn.js";
import type { ToolDef } from "../engine/llm.js";
import type { NativeToolDefinition } from "../providers/stream-types.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface PromptRouterConfig {
  classificationModel?: string;
  skipClassificationPatterns?: string[];
  defaultAgent?: string;
  maxParallelAgents?: number;
  confirmationThresholdUSD?: number;
  autoFollowUp?: boolean;
  showRoutingDecision?: boolean;
  customAgentsDir?: string;
  contextTracker?: ContextTracker;
}

const ROUTER_DEFAULTS = {
  defaultAgent: "assistant",
  maxParallelAgents: 3,
  confirmationThresholdUSD: 0.5,
  autoFollowUp: true,
  showRoutingDecision: false,
} as const;

// ─── Slash Commands ──────────────────────────────────────────────────────────

type SlashHandler = (sessionId: string, args: string) => Promise<Result<string, RouterError>>;

// ─── Router ──────────────────────────────────────────────────────────────────

export class PromptRouter extends EventEmitter {
  private registry: AgentRegistry;
  private classifier: IntentClassifier;
  private resolver: AgentResolver;
  private dispatcher: Dispatcher;
  private config: Required<Omit<PromptRouterConfig, "classificationModel" | "skipClassificationPatterns" | "customAgentsDir" | "contextTracker">> & {
    customAgentsDir: string;
  };
  private sessionManager: SessionManager;
  private contextTracker: ContextTracker | null;
  private lastAgentBySession = new Map<string, string>();
  private pendingConfirmation = new Map<string, RouteDecision>();
  private slashCommands: Map<string, SlashHandler>;

  constructor(
    config: PromptRouterConfig,
    sessionManager: SessionManager,
    classifierLLM: ClassifierLLM | null | undefined,
    agentRunner: AgentRunner,
  ) {
    super();
    this.sessionManager = sessionManager;
    this.contextTracker = config.contextTracker ?? null;

    this.config = {
      defaultAgent: config.defaultAgent ?? ROUTER_DEFAULTS.defaultAgent,
      maxParallelAgents: config.maxParallelAgents ?? ROUTER_DEFAULTS.maxParallelAgents,
      confirmationThresholdUSD: config.confirmationThresholdUSD ?? ROUTER_DEFAULTS.confirmationThresholdUSD,
      autoFollowUp: config.autoFollowUp ?? ROUTER_DEFAULTS.autoFollowUp,
      showRoutingDecision: config.showRoutingDecision ?? ROUTER_DEFAULTS.showRoutingDecision,
      customAgentsDir: config.customAgentsDir ?? path.join(os.homedir(), ".openpawl", "agents"),
    };

    this.registry = new AgentRegistry();
    this.classifier = new IntentClassifier(classifierLLM ?? null, this.registry.getAll());
    this.resolver = new AgentResolver(this.registry);
    this.dispatcher = new Dispatcher(this.registry, agentRunner);

    // Forward dispatcher events
    for (const event of DISPATCH_EVENTS) {
      this.dispatcher.on(event, (...args: unknown[]) => {
        this.emit(event, ...args);
      });
    }

    // Build slash command map
    this.slashCommands = new Map<string, SlashHandler>([
      ["help", (sid) => this.handleHelp(sid)],
      ["agents", (sid) => this.handleAgentsList(sid)],
      ["cost", (sid) => this.handleCost(sid)],
      ["status", (sid) => this.handleStatus(sid)],
      ["clear", (sid) => this.handleClear(sid)],
      ["compact", (sid, a) => this.handleCompact(sid, a)],
      ["model", (sid, a) => this.handleModel(sid, a)],
      ["agent", (sid, a) => this.handleSetAgent(sid, a)],
      ["export", (sid, a) => this.handleExport(sid, a)],
      ["config", (sid) => this.handleConfig(sid)],
      ["undo", (sid) => this.handleUndo(sid)],
    ]);
  }

  /** Abort any in-flight dispatch for the given session. */
  abort(sessionId: string): void {
    this.dispatcher.abort(sessionId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════════════

  async route(
    sessionId: string,
    prompt: string,
    options?: {
      appMode?: AppMode;
      /**
       * Override the active CheckpointCoordinator for crew dispatch.
       * When omitted, falls back to {@link getActiveCheckpointCoordinator}
       * (which returns whatever the host has registered, or null — in
       * which case `runCrew` builds its own headless coordinator).
       */
      checkpointCoordinator?: CheckpointCoordinator;
      /** Crew preset name. Defaults to FULL_STACK_PRESET. */
      crewName?: string;
      /** Working directory for crew tool calls. Defaults to process.cwd(). */
      workdir?: string;
      /** Cancellation signal piped through to the crew runner. */
      abortSignal?: AbortSignal;
      /**
       * Real tool executor for crew agents. Without this, the LLM emits
       * tool calls but no disk effect happens. The TUI host passes the
       * same instance it builds for solo dispatch.
       */
      executeTool?: ToolExecutor;
      /** Tool schema lookup for crew agents. Forwarded to runCrew. */
      getToolSchemas?: (toolNames: string[]) => ToolDef[];
      /** Native tool defs lookup. Forwarded to runCrew. */
      getNativeTools?: (toolNames: string[]) => NativeToolDefinition[];
      /** Test seam — defaults to the real {@link runCrew}. */
      runCrewImpl?: (args: RunCrewArgs) => Promise<CrewRunResult>;
    },
  ): Promise<Result<DispatchResult, RouterError>> {
    // 1. Check for pending confirmation
    const pendingDecision = this.pendingConfirmation.get(sessionId);
    if (pendingDecision) {
      return this.handleConfirmationResponse(sessionId, prompt, pendingDecision);
    }

    // 2. Check slash command
    const slashHandled = await this.handleSlashCommand(sessionId, prompt);
    if (slashHandled) {
      return ok({
        strategy: "single",
        agentResults: [{
          agentId: "system",
          success: true,
          response: slashHandled,
          toolCalls: [],
          duration: 0,
          inputTokens: 0,
          outputTokens: 0,
        }],
        totalDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      });
    }

    // 3. Parse mentions
    const mentions = parseMentions(prompt, this.registry.getIds());

    // 3b. Crew mode → invoke runCrew. Closes the PR #106 stub that was
    // missed across the rest of Phase 1 (the runner shipped in PRs
    // #109–#113 but the router-side dispatch was never re-wired).
    const appMode = options?.appMode;
    if (appMode === "crew") {
      return await this.dispatchCrew(sessionId, prompt, options);
    }

    // 4. Classify intent
    let intent: PromptIntent;
    if (mentions.hasExplicitRouting) {
      // Skip classification for explicit routing
      intent = {
        category: "code_write", // doesn't matter, mentions override
        confidence: 1.0,
        complexity: "simple",
        requiresTools: [],
        suggestedAgents: mentions.mentions.map((m) => m.agentId),
        reasoning: "Explicit @mention routing",
      };
    } else {
      const session = this.sessionManager.getActive();
      const classResult = await this.classifier.classify(mentions.cleanedPrompt, {
        workingDirectory: session?.getState().workingDirectory,
        trackedFiles: session?.getState().trackedFiles,
      });
      if (classResult.isErr()) return err(classResult.error);
      intent = classResult.value;
    }

    // 5. Resolve route
    const resolveResult = this.resolver.resolve(intent, mentions, {
      lastAgentId: this.lastAgentBySession.get(sessionId),
    });
    if (resolveResult.isErr()) return err(resolveResult.error);
    const decision = resolveResult.value;

    // 6. Show routing decision if debug mode
    if (this.config.showRoutingDecision) {
      this.emit(RouterEvent.Decision, sessionId, decision, intent);
    }

    // 7. Confirmation gate
    if (decision.requiresConfirmation) {
      this.pendingConfirmation.set(sessionId, decision);
      const agentNames = decision.agents.map((a) => a.role).join(", ");
      const costStr = "";
      return ok({
        strategy: "single",
        agentResults: [{
          agentId: "system",
          success: true,
          response: `This task will use [${agentNames}] with ${decision.strategy} strategy${costStr}. Proceed? [Y/n]`,
          toolCalls: [],
          duration: 0,
          inputTokens: 0,
          outputTokens: 0,
        }],
        totalDuration: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
      });
    }

    // 8. Build session history for context
    const activeSession = this.sessionManager.getActive();
    const allMessages = activeSession ? activeSession.buildContextMessages() : [];
    // The input handler appends the current user prompt to the chat
    // session before calling route() (so the UI renders it
    // immediately). Drop that trailing user turn here so priorMessages
    // contains only PRIOR turns — without this, the LLM sees the same
    // user message twice (once in history, once as userMessage) and
    // replies with things like "It looks like you sent 'abc' twice".
    const lastIdx = allMessages.length - 1;
    const stripCurrent = lastIdx >= 0 && allMessages[lastIdx]!.role === "user";
    const priorOnly = stripCurrent ? allMessages.slice(0, -1) : allMessages;
    const sessionHistory = priorOnly
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role, content: m.content }));

    // 9. Dispatch
    const dispatchResult = await this.dispatcher.dispatch(sessionId, mentions.cleanedPrompt, decision, sessionHistory);

    // 10. Track last agent for conversation continuity
    if (dispatchResult.isOk()) {
      const results = dispatchResult.value.agentResults;
      const lastAgent = results[results.length - 1];
      if (lastAgent && lastAgent.agentId !== "system") {
        this.lastAgentBySession.set(sessionId, lastAgent.agentId);
      }
    }

    return dispatchResult;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREW DISPATCH
  // ═══════════════════════════════════════════════════════════════════════════

  private async dispatchCrew(
    sessionId: string,
    prompt: string,
    options?: {
      checkpointCoordinator?: CheckpointCoordinator;
      crewName?: string;
      workdir?: string;
      abortSignal?: AbortSignal;
      executeTool?: ToolExecutor;
      getToolSchemas?: (toolNames: string[]) => ToolDef[];
      getNativeTools?: (toolNames: string[]) => NativeToolDefinition[];
      runCrewImpl?: (args: RunCrewArgs) => Promise<CrewRunResult>;
    },
  ): Promise<Result<DispatchResult, RouterError>> {
    const start = Date.now();
    this.emit(RouterEvent.AgentStart, sessionId, "crew");

    const runCrewFn = options?.runCrewImpl ?? runCrew;

    // The planner emits its plan as raw JSON tokens. Forwarding those
    // straight to RouterEvent.AgentToken dumps an unreadable JSON blob
    // into the chat. Buffer them here and replace the whole bubble with
    // a readable markdown plan once parsePlan succeeds (signaled by
    // onCrewPlanReady).
    let plannerJsonBuffer = "";
    let plannerPlanEmitted = false;

    try {
      const coord =
        options?.checkpointCoordinator ?? getActiveCheckpointCoordinator() ?? undefined;
      const crewName = options?.crewName ?? FULL_STACK_PRESET;
      const workdir = options?.workdir ?? process.cwd();

      const result: CrewRunResult = await runCrewFn({
        options: { goal: prompt, crew_name: crewName, workdir },
        session_id: sessionId,
        workdir,
        checkpointCoordinator: coord,
        executeTool: options?.executeTool,
        getToolSchemas: options?.getToolSchemas,
        getNativeTools: options?.getNativeTools,
        signal: options?.abortSignal,
        // Crew progress observability — the runtime fires this on
        // every subagent tool-call lifecycle event. Map it onto the
        // existing RouterEvent.AgentTool channel so the TUI's
        // onAgentTool handler in router-wiring can render tool views
        // exactly the way it does for solo dispatch. The agent_id is
        // the actual subagent (planner / coder / tester / …) so each
        // gets its own color and status-bar segment text. §5.6
        // isolation is preserved: this is observability, not context
        // bubbling — subagent prompts still reset per invocation.
        onProgress: (event) => {
          this.emit(
            RouterEvent.AgentTool,
            sessionId,
            event.agent_id,
            event.tool_name,
            event.status,
            event.details,
          );
        },
        // Crew token-level streaming — token-cadence analogue of
        // onProgress above. Every LLM-backed subagent (planner,
        // coder, tester, reflection, facilitator, compactor)
        // surfaces its stream here, attributed by the subagent's
        // own agent_id so the TUI's onAgentToken handler in
        // router-wiring (which already drives solo) can render
        // each agent's thinking under the correct badge. The
        // deterministic facilitator-fallback path is naturally a
        // no-op because it never invokes runAgentTurn.
        //
        // Special case: planner tokens are suppressed until the
        // plan is ready, then replaced with a readable markdown
        // render. See onCrewPlanReady below.
        onToken: (agentId, token) => {
          // Live token-footer tick. Chunks from the LLM stream are
          // strings of variable length (Anthropic ≈ 1 token/chunk,
          // OpenAI bursts up to ~10), so counting chunks as 1 each
          // grossly under-represents real usage. Estimate from text
          // length — the chars/4 rule is a robust approximation
          // across UTF-8 English/code for the major providers. The
          // wrapper's post-completion onCrewTokens (crew-runner.ts:377)
          // reports INPUT only so live + completion never double-count.
          const outputDelta = Math.max(1, Math.ceil(token.length / 4));
          this.emit(RouterEvent.CrewTokens, sessionId, agentId, 0, outputDelta);
          debugLog("debug", "crew", "crew:token_chunk", {
            data: { agent_id: agentId, chunk_len: token.length, output_delta: outputDelta },
          });
          if (agentId === PLANNER_AGENT_ID && !plannerPlanEmitted) {
            plannerJsonBuffer += token;
            return;
          }
          this.emit(RouterEvent.AgentToken, sessionId, agentId, token);
        },
        // Task-blocked lifecycle — fires once per task that
        // transitions into the blocked state, carrying the
        // structured BlockReason. The TUI's onAgentTaskBlocked
        // handler renders the inline ⊘ line under the responsible
        // agent in real time, rather than waiting for the
        // phase-summary table at the phase boundary.
        onTaskBlocked: (event) => {
          this.emit(
            RouterEvent.AgentTaskBlocked,
            sessionId,
            event.agent_id,
            event.task_id,
            event.task_name,
            event.reason,
          );
        },
        // ── Crew lifecycle (new in v0.4.x) — drives CrewProgressView
        onCrewAgentStart: (agentId, taskCount) => {
          this.emit(RouterEvent.CrewAgentStart, sessionId, agentId, taskCount);
        },
        onCrewAgentDone: (agentId, summary) => {
          this.emit(RouterEvent.CrewAgentDone, sessionId, agentId, summary);
        },
        onCrewAgentBlocked: (agentId, reason) => {
          this.emit(RouterEvent.CrewAgentBlocked, sessionId, agentId, reason);
        },
        onCrewTokens: (agentId, input, output) => {
          this.emit(RouterEvent.CrewTokens, sessionId, agentId, input, output);
        },
        onCrewPlanReady: (phases) => {
          plannerPlanEmitted = true;
          plannerJsonBuffer = "";
          this.emit(RouterEvent.CrewPlanReady, sessionId, phases);
          // Replace the would-be JSON dump with a single readable
          // markdown render. wireRouterEvents' onAgentToken
          // accumulates this into one planner bubble.
          this.emit(
            RouterEvent.AgentToken,
            sessionId,
            PLANNER_AGENT_ID,
            renderPlanMarkdown(phases),
          );
        },
      });

      const md = renderCrewResultMarkdown(result);
      const duration = Date.now() - start;
      const tokensUsed = result.status === "plan_failed" ? 0 : result.tokens_used;

      this.emit(RouterEvent.AgentDone, sessionId, "crew", {
        success: result.status === "completed",
      });

      const dispatchResult: DispatchResult = {
        strategy: "orchestrated",
        agentResults: [
          {
            agentId: "crew",
            success: result.status === "completed",
            response: md,
            toolCalls: [],
            duration,
            inputTokens: 0,
            outputTokens: tokensUsed,
          },
        ],
        totalDuration: duration,
        totalInputTokens: 0,
        totalOutputTokens: tokensUsed,
      };

      // Mirror the dispatcher path (dispatch-strategy.ts:112): emit Done
      // so the TUI's onDispatchDone handler runs — that's where the
      // status-bar token-pair display is updated. Without this, the
      // status bar stays at "idle" (or worse, the last tool name) and
      // the TUI looks frozen even though the run completed cleanly.
      this.emit(RouterEvent.Done, sessionId, dispatchResult);

      return ok(dispatchResult);
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      // Drain any buffered planner JSON so a planner failure still shows
      // what it tried to emit — otherwise the user sees nothing in the
      // bubble before the dispatch_failed error renders.
      if (plannerJsonBuffer && !plannerPlanEmitted) {
        this.emit(
          RouterEvent.AgentToken,
          sessionId,
          PLANNER_AGENT_ID,
          plannerJsonBuffer,
        );
        plannerJsonBuffer = "";
      }
      // AgentDone (with success: false) covers the TUI cleanup —
      // onAgentDone in router-wiring stops the thinking indicator and
      // resets the status bar. The caller (prompt-handler) renders the
      // error from the returned err; emitting RouterEvent.Error here
      // would duplicate the error message in the chat stream.
      this.emit(RouterEvent.AgentDone, sessionId, "crew", { success: false });
      return err({ type: "dispatch_failed", agentId: "crew", cause });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLASH COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle slash command. Returns response string if handled, null if not a slash command.
   */
  async handleSlashCommand(sessionId: string, prompt: string): Promise<string | null> {
    const trimmed = prompt.trim();
    if (!trimmed.startsWith("/")) return null;

    const spaceIdx = trimmed.indexOf(" ");
    const command = (spaceIdx >= 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1)).toLowerCase();
    const args = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1).trim() : "";

    const handler = this.slashCommands.get(command);
    if (!handler) return null; // Unknown slash command → pass through

    const result = await handler(sessionId, args);
    if (result.isOk()) return result.value;
    return `Error: ${result.error.type}`;
  }

  // ─── Slash Command Handlers ────────────────────────────────────────────────

  private async handleHelp(_sessionId: string): Promise<Result<string, RouterError>> {
    const lines = [
      "Available commands:",
      "  /help            Show this help message",
      "  /agents          List available agents",
      "  /model [name]    Show or switch current model",
      "  /agent <id>      Set default agent for this session",
      "  /cost            Show session token usage",
      "  /status          Show active agents, model, token usage",
      "  /clear           Clear display",
      "  /compact         Force context compression",
      "  /export [path]   Export conversation to markdown",
      "  /config          Show current config",
      "  /undo            Revert last file modification",
      "",
      "Agent mentions:",
      "  @coder           Route to Coder agent",
      "  @reviewer        Route to Code Reviewer",
      "  @planner         Route to Planner",
      "  @tester          Route to Tester",
      "  @debugger        Route to Debugger",
      "  @researcher      Route to Researcher",
      "",
      "Modes: Shift+Tab to cycle (solo/crew) | /mode to pick",
      "",
      "Example: @coder write a login form",
    ];
    return ok(lines.join("\n"));
  }

  private async handleAgentsList(_sessionId: string): Promise<Result<string, RouterError>> {
    const agents = this.registry.getAll();
    const termWidth = process.stdout.columns ?? 80;
    const nameCol = 15;
    const tierCol = 10;
    const descCol = Math.max(20, termWidth - nameCol - tierCol - 6); // 6 = padding/margins
    const lines = ["Available agents:", ""];
    for (const a of agents) {
      const tier = `[${a.modelTier}]`.padEnd(tierCol);
      const desc = a.description.length > descCol
        ? a.description.slice(0, descCol - 1) + "…"
        : a.description;
      lines.push(`  ${a.id.padEnd(nameCol)} ${tier} ${desc}`);
    }
    return ok(lines.join("\n"));
  }

  private async handleCost(_sessionId: string): Promise<Result<string, RouterError>> {
    const session = this.sessionManager.getActive();
    if (!session) return ok("No active session.");
    const { input, output } = session.tokens;
    const breakdown = session.getState().providerBreakdown;
    const total = input + output;
    const fmt = (n: number) => n < 1000 ? String(n) : n < 10_000 ? `${(n / 1000).toFixed(1)}k` : n < 1_000_000 ? `${Math.round(n / 1000)}k` : `${(n / 1_000_000).toFixed(1)}M`;
    const lines = [
      `Session tokens: ${fmt(total)}`,
      `  Input:  ${input.toLocaleString()}`,
      `  Output: ${output.toLocaleString()}`,
    ];
    for (const [provider, data] of Object.entries(breakdown)) {
      lines.push(`  ${provider}: ${fmt(data.tokens)}`);
    }
    return ok(lines.join("\n"));
  }

  private async handleStatus(_sessionId: string): Promise<Result<string, RouterError>> {
    const session = this.sessionManager.getActive();
    if (!session) return ok("No active session.");
    const state = session.getState();
    const lines = [
      `Session: ${state.id}`,
      `Title: ${state.title}`,
      `Status: ${state.status}`,
      `Messages: ${state.messageCount}`,
      `Active agents: ${state.activeAgents.join(", ") || "none"}`,
      `Tokens: ${state.totalInputTokens.toLocaleString()} in / ${state.totalOutputTokens.toLocaleString()} out`,
    ];
    return ok(lines.join("\n"));
  }

  private async handleClear(_sessionId: string): Promise<Result<string, RouterError>> {
    // The TUI layer will handle actual screen clearing
    this.emit(RouterEvent.CommandClear);
    return ok("Display cleared.");
  }

  private async handleCompact(_sessionId: string, args: string): Promise<Result<string, RouterError>> {
    const session = this.sessionManager.getActive();
    if (!session) return ok("No active session.");

    const messages = session.buildContextMessages();
    const tracker = this.contextTracker ?? new ContextTracker(128_000);
    const before = tracker.snapshot(messages);

    const levelUp: Record<ContextLevel, ContextLevel> = {
      normal: "high", warning: "high", high: "critical",
      critical: "emergency", emergency: "emergency",
    };
    const targetLevel = (args.includes("--force") || args.includes("--full"))
      ? "emergency" as ContextLevel
      : levelUp[before.level];

    const result = await compact(messages as CompactableMessage[], targetLevel);

    if (!result) {
      return ok(`Context: ${before.estimatedTokens.toLocaleString()} tokens (${before.utilizationPercent}% — ${before.level}). No compaction needed.`);
    }

    this.emit(RouterEvent.CommandCompact);
    return ok([
      `Compacted: ${result.strategy}`,
      `  Before: ${result.beforeTokens.toLocaleString()} tokens`,
      `  After:  ${result.afterTokens.toLocaleString()} tokens`,
      `  Saved:  ${(result.beforeTokens - result.afterTokens).toLocaleString()} tokens`,
      `  Messages affected: ${result.messagesAffected}`,
    ].join("\n"));
  }

  private async handleModel(_sessionId: string, args: string): Promise<Result<string, RouterError>> {
    if (!args) {
      return ok("Current model: (use provider default)\nUsage: /model <model-name>");
    }
    // Model switching would integrate with resolveModelForAgent
    this.emit(RouterEvent.CommandModel, args);
    return ok(`Model switched to: ${args}`);
  }

  private async handleSetAgent(sessionId: string, args: string): Promise<Result<string, RouterError>> {
    if (!args) return ok("Usage: /agent <agent-id>");
    if (!this.registry.has(args)) {
      return ok(`Unknown agent: ${args}. Use /agents to see available agents.`);
    }
    this.lastAgentBySession.set(sessionId, args);
    return ok(`Default agent set to: ${args}`);
  }

  private async handleExport(_sessionId: string, args: string): Promise<Result<string, RouterError>> {
    const exportPath = args || "session-export.md";
    this.emit(RouterEvent.CommandExport, exportPath);
    return ok(`Session export requested: ${exportPath}`);
  }

  private async handleConfig(_sessionId: string): Promise<Result<string, RouterError>> {
    const lines = [
      "Router config:",
      `  Default agent: ${this.config.defaultAgent}`,
      `  Max parallel agents: ${this.config.maxParallelAgents}`,
      `  Confirmation threshold: $${this.config.confirmationThresholdUSD}`,
      `  Auto follow-up: ${this.config.autoFollowUp}`,
      `  Show routing: ${this.config.showRoutingDecision}`,
    ];
    return ok(lines.join("\n"));
  }

  private async handleUndo(_sessionId: string): Promise<Result<string, RouterError>> {
    try {
      const { UndoManager } = await import("../conversation/undo-manager.js");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const undoMgr = new UndoManager(join(tmpdir(), "openpawl-undo"));
      const result = await undoMgr.undo();
      if (result.isOk()) {
        return ok(`Undo: restored ${result.value.filePath}`);
      }
      return ok(`Undo: ${result.error.cause}`);
    } catch {
      return ok("Nothing to undo.");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIRMATION
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleConfirmationResponse(
    sessionId: string,
    prompt: string,
    decision: RouteDecision,
  ): Promise<Result<DispatchResult, RouterError>> {
    this.pendingConfirmation.delete(sessionId);

    const lower = prompt.trim().toLowerCase();
    if (lower === "y" || lower === "yes" || lower === "ok" || lower === "") {
      return this.dispatcher.dispatch(sessionId, prompt, decision);
    }

    return err({ type: "confirmation_rejected", message: "Operation cancelled by user." });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  async initialize(): Promise<void> {
    await this.registry.loadUserAgents(this.config.customAgentsDir);
  }

  async shutdown(): Promise<void> {
    this.lastAgentBySession.clear();
    this.pendingConfirmation.clear();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CREW RESULT RENDERING
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Render the planner's structured plan as a single markdown block.
 * Replaces the raw JSON dump that the planner would otherwise stream
 * into the message bubble. Reads cleanly under the message bubble's
 * markdown renderer — one header, one block per phase, one indented
 * row per task.
 */
export function renderPlanMarkdown(phases: CrewPhase[]): string {
  const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
  const lines: string[] = [];
  lines.push(`**Plan: ${phases.length} ${phases.length === 1 ? "phase" : "phases"}, ${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}**`);
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    lines.push("");
    lines.push(`**Phase ${i + 1} — ${phase.name}**`);
    for (const task of phase.tasks) {
      const agent = agentDisplayName(task.assigned_agent);
      const deps = task.depends_on.length > 0
        ? ` ${`[depends: ${task.depends_on.join(", ")}]`}`
        : "";
      lines.push(`  ${task.id} · ${agent} · ${task.description}${deps}`);
    }
  }
  return lines.join("\n");
}

export function renderCrewResultMarkdown(result: CrewRunResult): string {
  if (result.status === "plan_failed") {
    return [
      `# Crew run failed during planning`,
      ``,
      `Crew: \`${result.crew_name}\``,
      `Reason: \`${result.error.reason}\``,
      ``,
      result.error.message,
    ].join("\n");
  }
  if (result.status === "plan_only") {
    return [
      `# Crew planning complete`,
      ``,
      `Crew: \`${result.crew_name}\` — ${result.phases.length} phase(s) planned, ${result.tokens_used} tokens`,
      ``,
      ...result.phases.map(
        (p, i) => `${i + 1}. **${p.name}** (\`${p.id}\`, tier ${p.complexity_tier}, ${p.tasks.length} tasks)`,
      ),
    ].join("\n");
  }
  // completed | halted | aborted — compact two-line-style summary. The
  // embedded ANSI escapes route this through the system-role pass-through
  // branch in MessagesComponent (messages.ts:522-524), bypassing markdown
  // wrapping so the styled glyphs survive intact.
  const glyph =
    result.status === "completed"
      ? defaultTheme.success("✓")
      : result.status === "aborted"
        ? defaultTheme.error("✗")
        : defaultTheme.warning("⊘");
  const heading =
    result.status === "completed"
      ? "Crew complete"
      : result.status === "aborted"
        ? "Crew aborted"
        : "Crew halted";
  const lines: string[] = [];
  lines.push(`${glyph} ${heading} · ${result.crew_name} · ${formatTokens(result.tokens_used)} tokens`);
  result.phases.forEach((p, i) => {
    const done = p.tasks.filter((t) => t.status === "completed").length;
    const failed = p.tasks.filter((t) => t.status === "failed").length;
    const blocked = p.tasks.filter((t) => t.status === "blocked").length;
    const parts: string[] = [`${done} done`];
    if (failed) parts.push(`${failed} failed`);
    if (blocked) parts.push(`${blocked} blocked`);
    lines.push(defaultTheme.dim(`  ↳ phase ${i + 1}: ${parts.join(", ")}`));
  });
  if (result.reanchor) {
    lines.push("");
    lines.push("## Re-anchor prompt");
    lines.push("");
    lines.push(result.reanchor.markdown);
  }
  if (result.new_goal_pending) {
    lines.push("");
    lines.push(`> User edited goal: ${result.new_goal_pending}`);
  }
  return lines.join("\n");
}
