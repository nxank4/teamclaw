/**
 * Wire PromptRouter and SessionManager events to TUI display.
 */

import { formatTokenPair, getAgentColorFn, agentDisplayName } from "./agent-display.js";
import { defaultTheme } from "../tui/themes/default.js";
import { RouterEvent, SessionEvent } from "../router/event-types.js";
import { ThinkingIndicator } from "../tui/components/thinking-indicator.js";
import { SPINNER_INTERVAL_MS } from "../tui/components/status-indicator.js";
import { ToolCallTokenFilter } from "../tui/text/tool-call-filter.js";
import {
  addTokens,
  createCrewRunState,
  markAgentDone,
  markAgentBlocked,
  markAgentQueued,
  markAgentRunning,
  markComplete,
  type CrewRunState,
} from "./crew-run-state.js";
import type { CrewPhase } from "../crew/types.js";
import type { AppLayout } from "./layout.js";
import type { PromptRouter } from "../router/prompt-router.js";
import type { SessionManager } from "../session/session-manager.js";

export interface RouterEventWiring {
  cleanup: () => void;
  /** Cancel the current in-flight dispatch. Returns true if something was cancelled. */
  cancelStreaming: () => boolean;
  /** Whether an agent is currently streaming tokens. */
  isStreaming: () => boolean;
}

export function wireRouterEvents(
  router: PromptRouter,
  layout: AppLayout,
  onAssistantResponse?: (agentId: string, content: string) => void,
  onPlanReady?: () => void,
  onQueueDrain?: () => void,
  onTokensUsed?: (input: number, output: number) => void,
): RouterEventWiring {
  let streamingForAgent: string | null = null;
  let streamedContent = "";
  let tokenFilter: ToolCallTokenFilter | null = null;
  let sessionInputTokens = 0;
  let sessionOutputTokens = 0;
  let activeSessionId: string | null = null;
  const thinking = new ThinkingIndicator();
  let thinkingMsgAdded = false;

  // ── Crew progress overlay (sticky tree above the divider) ──────────────
  // State + spinner are owned here so the router stays layout-agnostic.
  // The panel is hidden by default; AgentStart("crew") flips it visible
  // and AgentDone("crew") schedules a 3 s fade-out.
  let crewState: CrewRunState | null = null;
  let crewSpinnerFrame = 0;
  let crewSpinnerInterval: ReturnType<typeof setInterval> | null = null;
  let crewHideTimer: ReturnType<typeof setTimeout> | null = null;

  function ensureCrewState(goal: string = ""): CrewRunState {
    if (!crewState) crewState = createCrewRunState(goal);
    return crewState;
  }

  function pushCrewState(): void {
    const state = ensureCrewState();
    layout.crewProgress.setProps({ state, spinnerFrame: crewSpinnerFrame });
    layout.tui.requestRender();
  }

  function startCrewSpinner(): void {
    if (crewSpinnerInterval) return;
    crewSpinnerInterval = setInterval(() => {
      crewSpinnerFrame = (crewSpinnerFrame + 1) % 4;
      layout.crewProgress.setProps({ spinnerFrame: crewSpinnerFrame });
      layout.tui.requestRender();
    }, SPINNER_INTERVAL_MS);
  }

  function stopCrewSpinner(): void {
    if (crewSpinnerInterval) {
      clearInterval(crewSpinnerInterval);
      crewSpinnerInterval = null;
    }
  }

  function clearCrewHideTimer(): void {
    if (crewHideTimer) {
      clearTimeout(crewHideTimer);
      crewHideTimer = null;
    }
  }

  thinking.onUpdate = (text) => {
    if (!thinkingMsgAdded) return;
    // Only overwrite the spinner placeholder. If a `tool-approval` (or
    // any other tagged message) has been pushed on top, leave it
    // alone — otherwise the next 150ms tick would erase the permission
    // prompt before the user can read it. The crew dispatch path keeps
    // the indicator running for the entire run, so this guard is what
    // makes Y/N prompts visible for shell_exec / file_write.
    if (layout.messages.replaceLastByTag("thinking", text)) {
      layout.tui.requestRender();
    }
  };

  const onAgentStart = (sessionId: string, agentId: string) => {
    activeSessionId = sessionId;
    streamingForAgent = agentId;
    streamedContent = "";
    layout.messages.clearToolCalls();

    if (agentId === "crew") {
      // Fresh crew run — reset the live state and reveal the sticky
      // overlay. A previous run's hide-timer is cancelled so a rapid
      // re-dispatch never accidentally hides the new run.
      clearCrewHideTimer();
      crewState = createCrewRunState("");
      crewSpinnerFrame = 0;
      layout.crewProgress.setProps({ state: crewState, spinnerFrame: 0 });
      layout.tui.setFixedBottomHidden("crew-progress", false);
      startCrewSpinner();
    }
    tokenFilter = new ToolCallTokenFilter((filtered) => {
      // Append to the most recent agent message in the stream, not the
      // literal last entry. Without this, a tool-approval system
      // message pushed between two streamed chunks turns into a
      // "second Assistant:" header on the next chunk.
      if (!layout.messages.appendToLastAgent(filtered)) {
        layout.messages.appendToLast(filtered);
      }
      layout.tui.requestRender();
    });

    if (thinkingMsgAdded) {
      thinking.stop();
      layout.messages.replaceLast("");
      thinkingMsgAdded = false;
    }

    // Fresh dispatch — reset the per-run word history so this run can
    // draw from the full P-themed pool again. Persists across stop/start
    // within a run so idle gaps between subagents cycle to new words.
    thinking.resetRun();
    thinking.start();
    layout.messages.addMessage({
      role: "agent",
      agentName: agentDisplayName(agentId),
      agentColor: getAgentColorFn(agentId),
      content: thinking.getCurrentText(),
      timestamp: new Date(),
      tag: "thinking",
    });
    thinkingMsgAdded = true;

    layout.statusBar.updateSegment(3, `${agentDisplayName(agentId)} thinking... ${defaultTheme.dim("(Esc to cancel)")}`, defaultTheme.accent);
    layout.tui.requestRender();
  };

  const onAgentToken = (_sessionId: string, agentId: string, token: string) => {
    if (thinking.isVisible()) {
      thinking.stop();
      thinkingMsgAdded = false;
      // Swap the tagged thinking placeholder for a fresh untagged agent
      // message so the renderer drops the inline single-line layout and
      // streams tokens normally.
      layout.messages.replaceLastWith({
        role: "agent",
        agentName: agentDisplayName(agentId),
        agentColor: getAgentColorFn(agentId),
        content: "",
        timestamp: new Date(),
      });
      layout.statusBar.updateSegment(3, `${agentDisplayName(agentId)} working... ${defaultTheme.dim("(Esc)")}`, defaultTheme.accent);
    }
    // Only start a new agent message when the dispatch switches to a
    // different agent (e.g. crew handoff). For the same agent we keep
    // appending to the existing message — appendToLastAgent below
    // walks past any system messages (tool-approval prompts, etc.)
    // that may have been pushed between streamed chunks, so the user
    // sees one "Assistant:" header per turn instead of one per chunk.
    if (streamingForAgent !== agentId) {
      streamingForAgent = agentId;
      layout.messages.addMessage({
        role: "agent",
        agentName: agentDisplayName(agentId),
        agentColor: getAgentColorFn(agentId),
        content: "",
        timestamp: new Date(),
      });
    }

    streamedContent += token;

    if (tokenFilter) {
      tokenFilter.feed(token);
    } else {
      if (!layout.messages.appendToLastAgent(token)) {
        layout.messages.appendToLast(token);
      }
      layout.tui.requestRender();
    }
  };

  let toolSpinnerInterval: ReturnType<typeof setInterval> | null = null;

  const startToolSpinner = () => {
    if (toolSpinnerInterval) return;
    // Same 200ms cadence as the top-level ThinkingIndicator. Two
    // animated indicators visible at once now tick on the same beat
    // instead of competing at 80ms vs 200ms.
    toolSpinnerInterval = setInterval(() => {
      if (layout.messages.hasRunningToolCalls()) {
        layout.messages.advanceToolSpinners();
        layout.tui.requestRender();
      }
    }, SPINNER_INTERVAL_MS);
  };

  const stopToolSpinner = () => {
    if (toolSpinnerInterval) {
      clearInterval(toolSpinnerInterval);
      toolSpinnerInterval = null;
    }
  };

  const onAgentTool = (_sessionId: string, agentId: string, toolName: string, status: string, details?: { executionId?: string; inputSummary?: string; duration?: number; outputSummary?: string; success?: boolean; diff?: import("../utils/diff.js").DiffResult }) => {
    const execId = details?.executionId ?? `fallback_${Date.now()}`;

    if (status === "running") {
      layout.messages.startToolCall(execId, toolName, details?.inputSummary ?? toolName, agentId);
      startToolSpinner();
      // First running tool — silence the idle flavor animation so the
      // tree shows real progress without a stale "Pondering..." line
      // frozen inside it. We blank the placeholder content so the tree
      // renderer falls through to its "thinking..." fallback (an
      // overlay-styled hint inside the tree) instead of pinning the
      // last spinner frame.
      if (thinking.isVisible()) {
        thinking.stop();
        layout.messages.replaceLastByTag("thinking", "");
      }
      // Surface the active subagent + tool in the status bar. Solo
      // dispatch handles this via ToolEvent.Start in
      // init-session-router (showing just the tool name); for crew
      // we want to see WHICH agent is acting too, since the message
      // stream alone does not always make the role obvious between
      // runs. agentId here is the real subagent ("planner", "coder",
      // …), not the umbrella "crew" agent — that's what makes the
      // status text useful instead of generic.
      if (agentId !== "system" && agentId !== "crew") {
        layout.statusBar.updateSegment(
          3,
          `${agentDisplayName(agentId)}: ${toolName}...`,
          defaultTheme.accent,
        );
      }
    } else if (status === "completed" || status === "failed") {
      layout.messages.completeToolCall(execId, status === "completed", details?.outputSummary ?? "", details?.duration ?? 0, details?.diff);
      // No more running tools → the run is back in an idle gap (waiting
      // for the next subagent to spin up, a meeting, compaction, etc.).
      // Restart the flavor animation with a fresh 4-word selection so
      // the user sees movement during these gaps. thinkingMsgAdded gates
      // this to active dispatches — once AgentDone removes the
      // placeholder we don't want a rogue start() racing it.
      if (
        thinkingMsgAdded &&
        !thinking.isVisible() &&
        !layout.messages.hasRunningToolCalls()
      ) {
        thinking.start();
      }
    }

    layout.tui.requestRender();
  };

  const onAgentDone = (_sessionId: string, agentId: string, result?: { response?: string }) => {
    if (agentId === "crew") {
      if (crewState) markComplete(crewState);
      pushCrewState();
      stopCrewSpinner();
      // Auto-hide after a few seconds so the user sees the final tree
      // and totals, then the overlay collapses out of the layout.
      clearCrewHideTimer();
      crewHideTimer = setTimeout(() => {
        layout.tui.setFixedBottomHidden("crew-progress", true);
        layout.tui.requestRender();
        crewHideTimer = null;
      }, 3000);
    }
    const responseText = result?.response || streamedContent;
    if (responseText && agentId !== "system") {
      onAssistantResponse?.(agentId, responseText);
    }
    activeSessionId = null;
    streamingForAgent = null;
    streamedContent = "";
    tokenFilter?.flush();
    tokenFilter = null;
    thinking.stop();
    thinkingMsgAdded = false;
    // Strip the thinking placeholder. Solo dispatch already swapped
    // it for a streaming agent message in onAgentToken — that path
    // dropped the tag, so this is a no-op there. Crew dispatch never
    // emits AgentToken (subagents are isolated), so the placeholder
    // sits in the stream with its last-rendered spinner text frozen
    // in place. Without this removal the user sees a stale "Worth
    // the wait…" line after a clean crew run, and the next prompt
    // appears to render on top of an indicator that never went away.
    layout.messages.removeLastByTag("thinking");
    stopToolSpinner();
    layout.messages.bakeToolCalls();
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();

    if (responseText && onPlanReady) {
      onPlanReady();
    }

    // Note: queue drain is intentionally NOT triggered here. AgentDone
    // fires from inside dispatcher.dispatch — the surrounding
    // handleWithRouter await has not resolved yet, and the input
    // handler's `state.agentBusy` finally block has not run. Draining
    // here let the next queued prompt start before the current one
    // finished tearing down, which produced parallel/interleaved
    // output. The drain now lives in input-handler.ts at the point
    // where the dispatch has truly returned. The onQueueDrain hook is
    // kept on the wiring for callers that still want a per-agent
    // notification (none currently use it).
  };

  const onDispatchError = (_sessionId: string, error: { type: string; cause?: string }) => {
    if (!activeSessionId && error.cause?.includes("aborted")) return;

    activeSessionId = null;
    streamingForAgent = null;
    tokenFilter?.flush();
    tokenFilter = null;
    thinking.stop();
    thinkingMsgAdded = false;
    // Same reason as onAgentDone — strip a lingering thinking
    // placeholder so the error message lands cleanly instead of
    // sitting under a frozen spinner line.
    layout.messages.removeLastByTag("thinking");
    stopToolSpinner();
    stopCrewSpinner();
    clearCrewHideTimer();
    layout.tui.setFixedBottomHidden("crew-progress", true);
    layout.messages.clearToolCalls();
    layout.messages.addMessage({
      role: "error",
      content: `Dispatch error: ${error.type}`,
      timestamp: new Date(),
    });
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();
  };

  const onDispatchDone = (_sessionId: string, result: { totalInputTokens: number; totalOutputTokens: number }) => {
    sessionInputTokens += result.totalInputTokens;
    sessionOutputTokens += result.totalOutputTokens;
    const display = formatTokenPair(sessionInputTokens, sessionOutputTokens);
    layout.statusBar.updateSegment(3, display, null);
    layout.tui.requestRender();
    onTokensUsed?.(result.totalInputTokens, result.totalOutputTokens);
  };

  const cancelStreaming = (): boolean => {
    if (!activeSessionId) return false;
    const sid = activeSessionId;

    router.abort(sid);

    if (streamingForAgent) {
      tokenFilter?.flush();
      layout.messages.appendToLast(`\n\n${defaultTheme.dim("\u238b Cancelled")}`);
    }

    activeSessionId = null;
    streamingForAgent = null;
    streamedContent = "";
    tokenFilter = null;
    thinking.stop();
    thinkingMsgAdded = false;
    // Same reason as onAgentDone — strip a lingering thinking
    // placeholder. The cancellation message in `streamingForAgent`
    // appendToLast above goes to the streaming agent message, not
    // the spinner, so this remove is independent of that branch.
    layout.messages.removeLastByTag("thinking");
    stopToolSpinner();
    stopCrewSpinner();
    clearCrewHideTimer();
    layout.tui.setFixedBottomHidden("crew-progress", true);
    layout.messages.bakeToolCalls();
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();

    return true;
  };

  // ── Crew lifecycle listeners (drive the sticky tree) ───────────────────
  const onCrewPlanReady = (_sessionId: string, phases: CrewPhase[]): void => {
    const state = ensureCrewState();
    const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0);
    // Planner just finished producing the plan — promote it to done with
    // the task-count metric. Per-task agents below this entry land as
    // queued with their own "N tasks" tally.
    markAgentDone(state, "planner", `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}`);
    const taskCounts = new Map<string, number>();
    for (const phase of phases) {
      for (const task of phase.tasks) {
        taskCounts.set(task.assigned_agent, (taskCounts.get(task.assigned_agent) ?? 0) + 1);
      }
    }
    for (const [agentId, count] of taskCounts) {
      markAgentQueued(state, agentId, `${count} ${count === 1 ? "task" : "tasks"}`);
    }
    pushCrewState();
  };

  const onCrewAgentStart = (_sessionId: string, agentId: string, _taskCount: number): void => {
    const state = ensureCrewState();
    markAgentRunning(state, agentId);
    pushCrewState();
  };

  const onCrewAgentDone = (_sessionId: string, agentId: string, summary: string): void => {
    const state = ensureCrewState();
    markAgentDone(state, agentId, summary || "done");
    pushCrewState();
  };

  const onCrewAgentBlocked = (_sessionId: string, agentId: string, reason: string): void => {
    const state = ensureCrewState();
    markAgentBlocked(state, agentId, reason);
    pushCrewState();
  };

  const onCrewTokens = (
    _sessionId: string,
    agentId: string,
    input: number,
    output: number,
  ): void => {
    const state = ensureCrewState();
    addTokens(state, agentId, input, output);
    pushCrewState();
  };

  const onAgentTaskBlocked = (
    _sessionId: string,
    agentId: string,
    _taskId: string,
    taskName: string,
    reason: { code: string; message: string },
  ): void => {
    // One-shot ⊘ line as soon as the task-blocked transition fires —
    // gives the user real-time visibility instead of waiting for the
    // phase-summary table at the phase boundary. The structured reason
    // is also serialized into the phase summary artifact, so this
    // line is just the live mirror.
    layout.messages.addTaskBlockedLine({
      agentId,
      taskName,
      reasonMessage: reason.message,
    });
    layout.tui.requestRender();
  };

  router.on(RouterEvent.AgentStart, onAgentStart);
  router.on(RouterEvent.AgentToken, onAgentToken);
  router.on(RouterEvent.AgentTool, onAgentTool);
  router.on(RouterEvent.AgentTaskBlocked, onAgentTaskBlocked);
  router.on(RouterEvent.AgentDone, onAgentDone);
  router.on(RouterEvent.Done, onDispatchDone);
  router.on(RouterEvent.Error, onDispatchError);
  router.on(RouterEvent.CrewPlanReady, onCrewPlanReady);
  router.on(RouterEvent.CrewAgentStart, onCrewAgentStart);
  router.on(RouterEvent.CrewAgentDone, onCrewAgentDone);
  router.on(RouterEvent.CrewAgentBlocked, onCrewAgentBlocked);
  router.on(RouterEvent.CrewTokens, onCrewTokens);

  return {
    cleanup: () => {
      stopToolSpinner();
      stopCrewSpinner();
      clearCrewHideTimer();
      router.off(RouterEvent.AgentStart, onAgentStart);
      router.off(RouterEvent.AgentToken, onAgentToken);
      router.off(RouterEvent.AgentTool, onAgentTool);
      router.off(RouterEvent.AgentTaskBlocked, onAgentTaskBlocked);
      router.off(RouterEvent.AgentDone, onAgentDone);
      router.off(RouterEvent.Done, onDispatchDone);
      router.off(RouterEvent.Error, onDispatchError);
      router.off(RouterEvent.CrewPlanReady, onCrewPlanReady);
      router.off(RouterEvent.CrewAgentStart, onCrewAgentStart);
      router.off(RouterEvent.CrewAgentDone, onCrewAgentDone);
      router.off(RouterEvent.CrewAgentBlocked, onCrewAgentBlocked);
      router.off(RouterEvent.CrewTokens, onCrewTokens);
    },
    cancelStreaming,
    isStreaming: () => streamingForAgent !== null,
  };
}

// ---------------------------------------------------------------------------
// Wire SessionManager events → status bar updates
// ---------------------------------------------------------------------------

export function wireSessionEvents(
  sessionMgr: SessionManager,
  layout: AppLayout,
): () => void {
  const onTokensUpdated = (_sessionId: string, tokens: { input?: number; output?: number }) => {
    const display = formatTokenPair(tokens.input ?? 0, tokens.output ?? 0);
    layout.statusBar.updateSegment(3, display, null);
    layout.tui.requestRender();
  };

  const onMessageAdded = () => {
    layout.tui.requestRender();
  };

  sessionMgr.on(SessionEvent.CostUpdated, onTokensUpdated);
  sessionMgr.on(SessionEvent.MessageAdded, onMessageAdded);

  return () => {
    sessionMgr.off(SessionEvent.CostUpdated, onTokensUpdated);
    sessionMgr.off(SessionEvent.MessageAdded, onMessageAdded);
  };
}
