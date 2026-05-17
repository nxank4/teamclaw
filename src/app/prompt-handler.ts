/**
 * Prompt routing handlers — dispatch user messages to PromptRouter or
 * the fallback LLM, gated by the spec/plan phase machine.
 *
 * Three control paths in handleWithRouter:
 *   - the previous input ended with a "Approve spec? [y/n/edit]" or
 *     "Approve plan? [y/n/edit]" question → interpret this input as
 *     the answer and advance the phase machine accordingly
 *   - this is a fresh prompt classified as "complex" and the session
 *     is idle → auto-create a spec file, open it in $EDITOR, set the
 *     pending-confirmation field, return without dispatching
 *   - otherwise → existing flow: optional clarification + router.route
 *     + render results
 */

import { mkdir } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import { agentDisplayName, getAgentColorFn } from "./agent-display.js";
import { autoCompactIfNeeded, type CompactCommandDeps } from "./commands/compact.js";
import { buildDefaultGlobalConfig, readGlobalConfig } from "../core/global-config.js";
import { getConnectionState, setConnectionState } from "../core/connection-state.js";
import { debugLog } from "../debug/logger.js";
import { loadPlanFromFile } from "../plans/loader.js";
import { generatePlanTemplate } from "../plans/template.js";
import { writePlan } from "../plans/writer.js";
import { transition } from "../session/phase-machine.js";
import { classify } from "../spec/complexity.js";
import { loadSpecFromFile } from "../spec/loader.js";
import { deriveSlug, nextAvailableSlug } from "../spec/slug.js";
import { generateSpecTemplate } from "../spec/template.js";
import { writeSpec } from "../spec/writer.js";
import { ICONS } from "../tui/constants/icons.js";
import { defaultTheme } from "../tui/themes/default.js";
import { writeFileAtomic } from "../utils/atomic-write.js";
import { openInEditor } from "../utils/open-in-editor.js";

import type { SpecPlanCommandDeps } from "./commands/spec.js";
import type { AppLayout } from "./layout.js";
import type { PromptRouter } from "../router/prompt-router.js";
import type { Session } from "../session/session.js";

type MsgCtx = {
  addMessage: (role: string, content: string, options?: { tag?: string }) => void;
};

export async function handleWithRouter(
  text: string,
  session: Session,
  router: PromptRouter,
  layout: AppLayout,
  ctx: MsgCtx,
  compactDeps?: CompactCommandDeps | null,
  specPlanDeps?: SpecPlanCommandDeps | null,
): Promise<void> {
  if (compactDeps) {
    await autoCompactIfNeeded({
      deps: compactDeps,
      sessionId: session.id,
      emit: (lines, tag) => ctx.addMessage("system", lines.join("\n"), { tag }),
    });
  }

  // Path 1 — the previous turn left a pending phase question. Interpret
  // this input as the y/n/edit answer.
  if (specPlanDeps?.appCtx.pendingPhaseConfirmation) {
    await handlePendingPhaseAnswer(text, session, router, layout, ctx, specPlanDeps);
    return;
  }

  // Complexity classification (debug-log only) — feeds the gate below.
  const cfg = readGlobalConfig() ?? buildDefaultGlobalConfig();
  const cls = classify(text, cfg.complexityThreshold);
  debugLog("info", "orchestrator", "complexity_classified", {
    data: {
      class: cls.class,
      reasons: cls.reasons,
      prompt_excerpt: text.slice(0, 80),
    },
  });

  // Path 2 — fresh complex prompt on an idle session. Spawn the spec flow.
  if (
    specPlanDeps &&
    !specPlanDeps.bypass &&
    cls.class === "complex" &&
    session.getPhase().currentPhase === "idle"
  ) {
    await handleAutoSpec(text, session, layout, ctx, specPlanDeps);
    return;
  }

  // Path 3 — default flow: clarification + router.route + render.
  await dispatchNormally(text, session, router, layout, ctx);
}

// ── Path 2: auto-spec flow ────────────────────────────────────────────────

async function handleAutoSpec(
  prompt: string,
  session: Session,
  layout: AppLayout,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<void> {
  const specsDir = resolve(deps.getSpecsDir());
  await mkdir(specsDir, { recursive: true });
  const slug = nextAvailableSlug(deriveSlug(prompt), specsDir);
  const specPath = resolve(specsDir, `${slug}.md`);
  await writeFileAtomic(specPath, generateSpecTemplate(slug));

  const phase = session.getPhase().currentPhase;
  session.setPhase(transition(phase, "classifyComplex"), "classifyComplex");
  session.setPhase(transition("spec_required", "openSpec"), "openSpec");
  session.setSpecPath(specPath);
  deps.appCtx.lastOpenedSpec = { slug, path: specPath };
  deps.appCtx.lastOpenedKind = "spec";

  ctx.addMessage(
    "system",
    `${ICONS.bolt} Complex prompt → drafting spec '${slug}'. Edit the template, save, then approve.`,
  );

  const editor = deps.openInEditorImpl ?? openInEditor;
  await editor({ path: specPath, tui: layout.tui });

  deps.appCtx.pendingPhaseConfirmation = {
    kind: "spec",
    specPath,
    originalPrompt: prompt,
  };
  ctx.addMessage("system", `Approve spec '${slug}'? [y/n/edit]`);
}

// ── Path 1: pending-confirmation answer ──────────────────────────────────

async function handlePendingPhaseAnswer(
  text: string,
  session: Session,
  router: PromptRouter,
  layout: AppLayout,
  ctx: MsgCtx,
  deps: SpecPlanCommandDeps,
): Promise<void> {
  const pending = deps.appCtx.pendingPhaseConfirmation!;
  const answer = text.trim().toLowerCase();
  const editor = deps.openInEditorImpl ?? openInEditor;

  if (answer === "e" || answer === "edit") {
    const path = pending.kind === "spec" ? pending.specPath : pending.planPath!;
    await editor({ path, tui: layout.tui });
    ctx.addMessage("system", `Approve ${pending.kind} '${basename(path, ".md")}'? [y/n/edit]`);
    return;
  }

  if (answer === "n" || answer === "no" || answer === "abandon") {
    deps.appCtx.pendingPhaseConfirmation = null;
    const currentPhase = session.getPhase().currentPhase;
    session.setPhase(transition(currentPhase, "abandon"), "abandon");
    if (pending.kind === "spec") {
      const doc = await loadSpecFromFile(pending.specPath);
      await writeSpec({ ...doc, frontmatter: { ...doc.frontmatter, status: "abandoned" } });
    } else {
      const doc = await loadPlanFromFile(pending.planPath!);
      await writePlan({ ...doc, frontmatter: { ...doc.frontmatter, status: "abandoned" } });
    }
    ctx.addMessage("system", `${ICONS.warning} Abandoned. File status set to 'abandoned'.`);
    return;
  }

  if (answer !== "y" && answer !== "yes") {
    ctx.addMessage("error", "Reply with y, n, or edit.");
    return; // pending stays set; the next input still applies
  }

  // Y branch — approve and advance.
  if (pending.kind === "spec") {
    const specDoc = await loadSpecFromFile(pending.specPath);
    await writeSpec({ ...specDoc, frontmatter: { ...specDoc.frontmatter, status: "approved" } });
    session.setPhase(transition(session.getPhase().currentPhase, "approveSpec"), "approveSpec");
    ctx.addMessage("system", `${ICONS.success} Spec '${specDoc.frontmatter.slug}' approved. Drafting plan.`);

    const plansDir = resolve(deps.getPlansDir());
    await mkdir(plansDir, { recursive: true });
    const planSlug = nextAvailableSlug(specDoc.frontmatter.slug, plansDir);
    const planPath = resolve(plansDir, `${planSlug}.md`);
    const specRelative = relative(plansDir, pending.specPath);
    await writeFileAtomic(
      planPath,
      generatePlanTemplate({ slug: planSlug, specPath: specRelative }),
    );

    session.setPhase(transition("spec_approved", "openPlan"), "openPlan");
    session.setPlanPath(planPath);
    deps.appCtx.lastOpenedPlan = { slug: planSlug, path: planPath };
    deps.appCtx.lastOpenedKind = "plan";

    await editor({ path: planPath, tui: layout.tui });

    deps.appCtx.pendingPhaseConfirmation = {
      kind: "plan",
      specPath: pending.specPath,
      planPath,
      originalPrompt: pending.originalPrompt,
    };
    ctx.addMessage("system", `Approve plan '${planSlug}'? [y/n/edit]`);
    return;
  }

  // Plan approval → execute.
  const planDoc = await loadPlanFromFile(pending.planPath!);
  await writePlan({ ...planDoc, frontmatter: { ...planDoc.frontmatter, status: "approved" } });
  session.setPhase(transition(session.getPhase().currentPhase, "approvePlan"), "approvePlan");
  session.setPhase(transition("plan_approved", "startExecute"), "startExecute");
  deps.appCtx.pendingPhaseConfirmation = null;
  ctx.addMessage(
    "system",
    `${ICONS.success} Plan '${planDoc.frontmatter.slug}' approved. Executing.`,
  );

  await dispatchNormally(pending.originalPrompt, session, router, layout, ctx);
}

// ── Path 3: default dispatch flow (extracted unchanged) ──────────────────

async function dispatchNormally(
  text: string,
  session: Session,
  router: PromptRouter,
  layout: AppLayout,
  ctx: MsgCtx,
): Promise<void> {
  try {
    const { ClarificationDetector } = await import("../conversation/clarification.js");
    const detector = new ClarificationDetector();
    const clarification = detector.detect(text, {});
    if (clarification?.severity === "ask") {
      ctx.addMessage("system", defaultTheme.warning(`❓ ${clarification.questions[0]}`));
      layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
      layout.tui.requestRender();
      return;
    }
  } catch {
    // Clarification module not available — proceed without it
  }

  layout.statusBar.updateSegment(3, "routing...", defaultTheme.accent);
  layout.tui.requestRender();

  const result = await router.route(session.id, text);

  if (result.isErr()) {
    if ("cause" in result.error && result.error.cause?.includes("aborted")) return;
    const cause = "cause" in result.error ? `: ${result.error.cause}` : "";
    ctx.addMessage("error", `Error: ${result.error.type}${cause}`);
    layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
    layout.tui.requestRender();
    return;
  }

  const dispatch = result.value;

  for (const agentResult of dispatch.agentResults) {
    if (!agentResult.response) continue;

    if (agentResult.agentId === "system") {
      ctx.addMessage("system", agentResult.response);
    } else if (agentResult.inputTokens === 0 && agentResult.outputTokens === 0) {
      layout.messages.addMessage({
        role: "agent",
        agentName: agentDisplayName(agentResult.agentId),
        agentColor: getAgentColorFn(agentResult.agentId),
        content: agentResult.response,
        timestamp: new Date(),
      });
      layout.tui.requestRender();
    }
  }

  layout.statusBar.updateSegment(3, "idle", defaultTheme.dim);
  layout.tui.requestRender();
}

// ── handleChatFallback (unchanged from prior commits) ────────────────────

export async function handleChatFallback(
  text: string,
  layout: AppLayout,
  ctx: { addMessage: (role: string, content: string) => void },
): Promise<void> {
  layout.statusBar.updateSegment(3, "thinking...", defaultTheme.accent);
  layout.tui.requestRender();

  try {
    const { callLLM } = await import("../engine/llm.js");
    layout.messages.addMessage({ role: "assistant", content: "", timestamp: new Date() });

    const { buildIdentityPrefix } = await import("../router/agent-registry.js");
    await callLLM(text, {
      systemPrompt: buildIdentityPrefix("Assistant") +
        "\n\nYou are running in a terminal. Use markdown formatting when helpful.",
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

    const connState = getConnectionState();
    if (opError.code === "AUTH_FAILED") {
      setConnectionState({ ...connState, status: "auth_failed" }, { force: true });
    } else if (opError.code === "NETWORK_ERROR") {
      setConnectionState({ ...connState, status: "offline" }, { force: true });
    } else if (opError.code !== "RATE_LIMITED" && opError.code !== "CONTEXT_LENGTH_EXCEEDED") {
      setConnectionState({ ...connState, status: "error" }, { force: true });
    }

    const lines: string[] = [`${ICONS.error} ${opError.userMessage}`];
    if (opError.quickFixes.length > 0) {
      lines.push("");
      for (const fix of opError.quickFixes) {
        if (fix.command) lines.push(`  ${fix.command.padEnd(35)} ${fix.description}`);
        else lines.push(`  ${ICONS.bullet} ${fix.description}`);
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
