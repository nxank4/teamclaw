/**
 * OpenPawl TUI application entry point.
 * Launched when user runs `openpawl` with no subcommand.
 *
 * Wires the existing TUI framework (src/tui/) to:
 *   - SessionManager (src/session/) for persistent session state
 *   - PromptRouter (src/router/) for intent classification + agent dispatch
 *
 * Tiered provider validation:
 *   Tier 1 (startup): Instant config check — sync file read, 0.1ms, no network
 *   Tier 2 (background): Provider healthCheck() ping — 100ms after first paint
 *   Tier 3 (implicit): Real validation on first LLM call — errors surface in chat
 */

import { mark, printStartupTimings } from "./startup.js";
import { buildWelcomeContent } from "./welcome.js";
import { initSessionRouter, type AppContext } from "./init-session-router.js";
import { setupInputHandler, type PromptQueueState } from "./input-handler.js";
import { setupKeybindings } from "./keybindings-setup.js";
import { setupConfigAndProviders, startTier2HealthPing } from "./config-wiring.js";
import { setupTuiCallbacks, setupCrashAndCleanup } from "./tui-callbacks.js";
import { createLayout } from "./layout.js";
import {
  CommandRegistry,
  parseInput,
  createBuiltinCommands,
  type Terminal,
} from "../tui/index.js";
import { registerAllCommands } from "./commands/index.js";
import { createAutocompleteProvider } from "./autocomplete.js";
import { setLoggerMuted, logger, isDebugMode } from "../core/logger.js";
import { defaultTheme } from "../tui/themes/default.js";
import { ICONS } from "../tui/constants/icons.js";

export interface LaunchOptions {
  /** Custom terminal for testing (VirtualTerminal). */
  terminal?: Terminal;
  /** Custom sessions directory for testing. */
  sessionsDir?: string;
  /**
   * Pre-resumed session from `openpawl --sessions <id>`. When set, init
   * skips the create-fresh path and uses this session directly.
   */
  resumedSession?: import("../session/session.js").Session;
  /**
   * From `openpawl --sessions` (no id). Triggers the picker overlay
   * on startup after the TUI mounts.
   */
  openSessionPicker?: boolean;
}

/**
 * Launch the interactive TUI.
 * Blocks until the user exits (Ctrl+C, /quit, Ctrl+D).
 */
export async function launchTUI(opts?: LaunchOptions): Promise<void> {
  mark("launchTUI() entered");
  setLoggerMuted(true);

  const layout = createLayout(opts?.terminal);
  mark("layout created (TUI components)");
  const registry = new CommandRegistry();

  const ctx: AppContext = {
    sessionMgr: null,
    router: null,
    chatSession: null,
    cleanupRouter: null,
    cleanupSession: null,
    doomLoopDetector: null,
    toolOutputHandler: null,
    configState: null,
    memoryCleanup: null,
    onQueueDrain: null,
    toolRegistry: null,
    toolExecutor: null,
    compactDeps: null,
    lastOpenedSpec: null,
    lastOpenedPlan: null,
    lastOpenedKind: null,
    pendingPhaseConfirmation: null,
    specPlanDeps: null,
  };

  // Register commands
  for (const cmd of createBuiltinCommands(() => registry)) {
    registry.register(cmd);
  }
  registerAllCommands(registry);
  mark("commands registered");

  // Load saved theme
  {
    const { readGlobalConfig } = await import("../core/global-config.js");
    const { getThemeEngine } = await import("../tui/themes/theme-engine.js");
    mark("theme engine imported");
    const cfg = readGlobalConfig();
    mark("global config read (file I/O)");
    if (cfg?.uiTheme) {
      getThemeEngine().switchTheme(cfg.uiTheme);
    }
    mark("theme applied");
  }
  if (isDebugMode()) {
    logger.debug(`registry has ${registry.getAll().map((c: { name: string }) => c.name).join(", ")}`);
  }

  layout.editor.setAutocompleteProvider(
    createAutocompleteProvider(registry, process.cwd()),
  );

  // Spec/plan workspace primitives — five commands share one deps
  // object so each call site reads the current config + AppContext.
  {
    const { createSpecCommand } = await import("./commands/spec.js");
    const { createPlanCommand } = await import("./commands/plan.js");
    const { createApproveCommand } = await import("./commands/approve.js");
    const { createSpecsCommand } = await import("./commands/specs.js");
    const { createPlansCommand } = await import("./commands/plans.js");
    const { readGlobalConfig, buildDefaultGlobalConfig } = await import("../core/global-config.js");
    const specPlanDeps = {
      appCtx: ctx,
      tui: layout.tui,
      getSpecsDir: () => (readGlobalConfig() ?? buildDefaultGlobalConfig()).specsDirectory,
      getPlansDir: () => (readGlobalConfig() ?? buildDefaultGlobalConfig()).plansDirectory,
    };
    ctx.specPlanDeps = specPlanDeps;
    registry.register(createSpecCommand(specPlanDeps));
    registry.register(createPlanCommand(specPlanDeps));
    registry.register(createApproveCommand(specPlanDeps));
    registry.register(createSpecsCommand(specPlanDeps));
    registry.register(createPlansCommand(specPlanDeps));
  }

  // ── Input handler + queue ────────────────────────────────────────
  const state: PromptQueueState = { queue: [], agentBusy: false, welcomeMessageActive: false };
  setupInputHandler(layout, registry, ctx, state);

  // ── Welcome message ──────────────────────────────────────────────
  const addWelcomeMessage = () => {
    // Skip the banner when the launch was an explicit session-resume —
    // the resume banner (or the sessions picker) is the entry point in
    // those cases, and the welcome card would just compete for space.
    if (opts?.resumedSession || opts?.openSessionPicker) return;

    layout.messages.addMessage({
      role: "system",
      content: buildWelcomeContent(),
      timestamp: new Date(),
    });
    state.welcomeMessageActive = true;

    void (async () => {
      try {
        const { collectBriefingData, renderBriefing } = await import("../briefing/index.js");
        const data = await collectBriefingData();
        if (data.lastSession) {
          const briefing = renderBriefing(data);
          layout.messages.addMessage({ role: "system", content: briefing, timestamp: new Date() });
          layout.tui.requestRender();
        }
      } catch {
        // Briefing is non-critical
      }
    })();
  };

  const welcomeResizeHandler = () => {
    if (state.welcomeMessageActive && layout.messages.getMessageCount() === 1) {
      layout.messages.replaceLast(buildWelcomeContent());
      layout.tui.requestRender();
    }
  };
  process.stdout.on("resize", welcomeResizeHandler);

  // ── Config, providers, wizard ────────────────────────────────────
  const configResult = await setupConfigAndProviders(layout, ctx, opts, registry, addWelcomeMessage);

  // ── Keybindings, palette, shortcuts ──────────────────────────────
  setupKeybindings(layout, registry, ctx);

  // /copy command
  registry.register({
    name: "copy",
    description: "Copy last agent response to clipboard",
    async execute(_args, msgCtx) {
      const ok = await layout.messages.copyLastResponse();
      if (ok) {
        msgCtx.addMessage("system", defaultTheme.success(`${ICONS.success} Copied to clipboard`));
      } else {
        msgCtx.addMessage("system", "No agent response to copy.");
      }
    },
  });

  // ── TUI callbacks + cleanup ──────────────────────────────────────
  const { flashTimer } = setupTuiCallbacks(layout, ctx);
  setupCrashAndCleanup(layout, ctx, flashTimer, welcomeResizeHandler);

  // ── Start TUI ────────────────────────────────────────────────────
  mark("tui.start() — first paint");
  layout.tui.start();
  mark("TUI running, prompt visible");
  printStartupTimings();

  // ── Tier 2: Background health ping ───────────────────────────────
  startTier2HealthPing(
    configResult.instantConfig,
    ctx,
    layout,
    configResult.refreshProviderConfig,
    configResult.getProviderActiveModel,
  );

  // ── Initialize SessionManager + PromptRouter in background ───────
  initSessionRouter(ctx, opts, layout, registry).catch(() => {});

  // Block until exit
  await new Promise<void>((resolve) => {
    const origExit = layout.tui.onExit;
    layout.tui.onExit = () => {
      origExit?.();
      resolve();
    };
  });
}

// ---------------------------------------------------------------------------
// Non-interactive print mode
// ---------------------------------------------------------------------------

interface PrintArgs {
  goal: string;
  workdir?: string;
}

export function parsePrintArgs(args: string[]): PrintArgs | { error: string } {
  let goal: string | null = null;
  let workdir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--workdir" && args[i + 1]) {
      workdir = args[++i]!;
    } else if (arg && !arg.startsWith("--") && goal === null) {
      goal = arg;
    } else {
      return { error: `unexpected argument: ${arg}` };
    }
  }

  if (goal === null) {
    return { error: "missing prompt" };
  }
  return { goal, workdir };
}

export async function runPrint(args: string[]): Promise<void> {
  const parsed = parsePrintArgs(args);
  if ("error" in parsed) {
    console.error(`Error: ${parsed.error}`);
    console.error("Usage: openpawl -p <prompt> [--workdir <path>]");
    console.error('  openpawl -p "/status"');
    process.exit(1);
  }

  // /status special case — health check, no LLM.
  const slash = parseInput(parsed.goal);
  if (slash.type === "command" && slash.name === "status") {
    const { getGlobalProviderManager } = await import("../providers/provider-factory.js");
    const pm = await getGlobalProviderManager();
    for (const p of pm.getProviders()) {
      const ok = await p.healthCheck().catch(() => false);
      console.log(`${p.name}: ${p.isAvailable() ? "available" : "unavailable"} health=${ok ? "ok" : "fail"}`);
    }
    return;
  }

  const { runHeadless } = await import("./run-headless.js");
  const result = await runHeadless({
    goal: parsed.goal,
    workdir: parsed.workdir,
  });
  process.exit(result.exitCode);
}
