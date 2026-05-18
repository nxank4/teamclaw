/**
 * Editor submit handler, prompt queue, and abort logic.
 */

import { handleWithRouter, handleChatFallback } from "./prompt-handler.js";
import { resolveFileRef } from "./file-ref.js";
import { executeShell } from "./shell.js";
import { ICONS } from "../tui/constants/icons.js";
import { parseInput, type CommandRegistry } from "../tui/index.js";
import { getConnectionState } from "../core/connection-state.js";
import { findClosest } from "../utils/fuzzy.js";
import type { AppLayout } from "./layout.js";
import type { AppContext } from "./init-session-router.js";
import {
  InteractiveBlock,
  type InteractiveBlockSpec,
  type InteractiveBlockDeps,
} from "../tui/components/interactive-block/index.js";

export interface PromptQueueState {
  queue: { text: string; fullPrompt: string; attachedFiles?: string[] }[];
  agentBusy: boolean;
  welcomeMessageActive: boolean;
}

function createMsgCtx(
  layout: AppLayout,
  ctx: AppContext,
) {
  // Tracks the status-bar right text in effect before any interactive
  // block grabbed it. Restored when the block unmounts. Null = no
  // saved state (nothing to restore).
  let savedRightText: string | null = null;

  const addMessage = (role: string, content: string, options?: { tag?: string }) => {
    layout.messages.addMessage({
      role: role as "system" | "user" | "error" | "assistant" | "agent" | "tool",
      content,
      timestamp: new Date(),
      tag: options?.tag as "tool-approval" | "thinking" | "op:compact" | "op:themes" | undefined,
    });
    if (ctx.chatSession && role !== "error") {
      ctx.chatSession.addMessage({
        role: role as "user" | "assistant" | "system" | "tool",
        content,
        metadata: role === "system" ? { transient: true } : undefined,
      });
    }
    layout.tui.requestRender();
  };

  const blockDeps: InteractiveBlockDeps = {
    pushKeyHandler: (h) => layout.tui.pushKeyHandler(h),
    popKeyHandler: () => layout.tui.popKeyHandler(),
    requestRender: () => layout.tui.requestRender(),
    addMessage: (role, content, options) => addMessage(role, content, options),
    replaceByTag: (tag, content) =>
      layout.messages.replaceByTag(
        tag as "tool-approval" | "thinking" | "op:compact" | "op:themes",
        content,
      ),
    removeLastByTag: (tag) => layout.messages.removeLastByTag(tag),
    setStatusHint: (text) => {
      if (savedRightText === null) {
        // Capture the prior value once per mount cycle; nested mounts
        // would otherwise overwrite the original with a hint.
        savedRightText = layout.statusBar.getRightText();
      }
      layout.statusBar.setRightText(text);
      layout.tui.requestRender();
    },
    clearStatusHint: () => {
      layout.statusBar.setRightText(savedRightText ?? "");
      savedRightText = null;
      layout.tui.requestRender();
    },
  };

  return {
    addMessage,
    clearMessages: () => {
      layout.messages.clear();
      ctx.chatSession?.clearMessages();
    },
    requestRender: () => layout.tui.requestRender(),
    exit: () => { layout.tui.stop(); },
    tui: layout.tui,
    mountInteractiveBlock: <T>(spec: InteractiveBlockSpec<T>): InteractiveBlock<T> => {
      const block = new InteractiveBlock(spec, blockDeps);
      block.mount();
      return block;
    },
  };
}

export function setupInputHandler(
  layout: AppLayout,
  registry: CommandRegistry,
  ctx: AppContext,
  state: PromptQueueState,
): void {
  layout.editor.onSubmit = async (text: string, attachedFiles?: string[]) => {
    state.welcomeMessageActive = false;
    layout.editor.pushHistory(text);
    const parsed = parseInput(text);
    const msgCtx = createMsgCtx(layout, ctx);

    switch (parsed.type) {
      case "command": {
        if (!parsed.name) {
          msgCtx.addMessage("error", "Type a command name after /. Try /help for a list.");
          break;
        }
        const result = registry.lookup(`/${parsed.name} ${parsed.args}`);
        if (result) {
          await result.command.execute(result.args, msgCtx);
        } else if (ctx.router && ctx.chatSession) {
          const slashResult = await ctx.router.handleSlashCommand(ctx.chatSession.id, `/${parsed.name} ${parsed.args}`);
          if (slashResult) {
            msgCtx.addMessage("system", slashResult);
          } else {
            const allCmds = registry.getAll().map((c) => c.name);
            const suggestion = findClosest(parsed.name, allCmds);
            msgCtx.addMessage("error", suggestion
              ? `Unknown command: /${parsed.name}. Did you mean /${suggestion}?`
              : `Unknown command: /${parsed.name}. Type /help for commands.`);
          }
        } else {
          const allCmds = registry.getAll().map((c) => c.name);
          const suggestion = findClosest(parsed.name, allCmds);
          msgCtx.addMessage("error", suggestion
            ? `Unknown command: /${parsed.name}. Did you mean /${suggestion}?`
            : `Unknown command: /${parsed.name}. Type /help for commands.`);
        }
        break;
      }

      case "shell": {
        msgCtx.addMessage("system", `$ ${parsed.command}`);
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
          msgCtx.addMessage("error", file.error);
        } else {
          msgCtx.addMessage("system", `📎 ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
        }
        break;
      }

      case "message": {
        ctx.doomLoopDetector?.reset();

        let fullPrompt = text;
        if (attachedFiles && attachedFiles.length > 0) {
          const { readFileSync, existsSync } = await import("node:fs");
          const { resolve } = await import("node:path");
          const fileSections: string[] = [];
          for (const filePath of attachedFiles) {
            const resolved = resolve(process.cwd(), filePath);
            if (existsSync(resolved)) {
              try {
                const content = readFileSync(resolved, "utf-8");
                fileSections.push(`<file path="${filePath}">\n${content}\n</file>`);
              } catch {
                fileSections.push(`<file path="${filePath}">[Could not read file]</file>`);
              }
            }
          }
          if (fileSections.length > 0) {
            fullPrompt = fileSections.join("\n\n") + "\n\n" + text;
          }
        }

        if (state.agentBusy) {
          state.queue.push({ text, fullPrompt, attachedFiles });
          // Render the prompt in the message stream immediately, with
          // the same shape as the non-queued path below (tags prefix
          // for attached files, full-colour user styling). Without
          // this the user pressed Enter, the editor cleared, and
          // nothing visible appeared until the dispatch finished \u2014
          // they thought their prompt had been dropped.
          //
          // We render directly to `layout.messages` rather than
          // through `msgCtx.addMessage`. msgCtx also writes to
          // `chatSession`, which would inject the queued prompt into
          // the LLM history *before* the in-flight turn's assistant
          // response \u2014 corrupting chronology and reintroducing the
          // U+8-shaped duplication the router strip in PR #123 only
          // catches when the trailing turn is a user message. The
          // drain path below writes to chatSession at dispatch time,
          // which puts the prompt in the right slot.
          const renderedText = attachedFiles && attachedFiles.length > 0
            ? `${attachedFiles.map((f) => `[@${f.split("/").pop()}]`).join(" ")} ${text}`
            : text;
          layout.messages.addMessage({
            role: "user",
            content: renderedText,
            timestamp: new Date(),
          });
          layout.divider.setLabel(`\u23f3 ${state.queue.length} queued`);
          layout.tui.requestRender();
          break;
        }

        if (attachedFiles && attachedFiles.length > 0) {
          const tags = attachedFiles.map((f) => `[@${f.split("/").pop()}]`).join(" ");
          msgCtx.addMessage("user", `${tags} ${text}`);
        } else {
          msgCtx.addMessage("user", text);
        }

        if (ctx.chatSession?.getState().title === "Untitled session" || ctx.chatSession?.getState().title === "New session") {
          const { generateSessionName } = await import("../session/session-name.js");
          const name = generateSessionName(text);
          if (name !== "Untitled session") ctx.chatSession.setTitle(name);
        }

        {
          const connState = getConnectionState();
          if (connState.status === "no_key") {
            if (!ctx.configState?.hasProvider) {
              msgCtx.addMessage("system", `${ICONS.warning} No provider configured. Run /settings to set up your AI provider.`);
            } else {
              msgCtx.addMessage("system", `${ICONS.warning} No API key found. Run /settings to configure your provider.`);
            }
            break;
          }
          if (connState.status === "auth_failed" && !ctx.router) {
            msgCtx.addMessage("system", `${ICONS.warning} API key invalid. Run /settings to update your credentials.`);
            break;
          }
        }

        state.agentBusy = true;
        try {
          if (ctx.router && ctx.chatSession) {
            await handleWithRouter(fullPrompt, ctx.chatSession, ctx.router, layout, msgCtx, ctx.compactDeps, ctx.specPlanDeps);
          } else {
            await handleChatFallback(fullPrompt, layout, msgCtx);
          }
        } finally {
          state.agentBusy = false;
          // Drain the queue here, AFTER the dispatch has fully
          // returned. Draining inside the router's AgentDone handler
          // (where this lived before) raced the surrounding await:
          // the next prompt could start before the current one
          // finished tearing down, so the two ran in parallel and
          // their output interleaved. Now the next prompt cannot start
          // until the current turn's finally block runs.
          ctx.onQueueDrain?.();
        }
        break;
      }
    }
  };

  // Process next queued prompt
  const processNextFromQueue = async () => {
    if (state.queue.length === 0) {
      layout.divider.setLabel(null);
      layout.tui.requestRender();
      return;
    }
    const next = state.queue.shift()!;
    layout.divider.setLabel(
      state.queue.length > 0 ? `\u23f3 ${state.queue.length} queued` : null,
    );
    layout.messages.markNextPendingAsActive();
    layout.tui.requestRender();

    if (ctx.chatSession) {
      ctx.chatSession.addMessage({ role: "user", content: next.text });
    }

    const queueMsgCtx = createMsgCtx(layout, ctx);

    state.agentBusy = true;
    try {
      if (ctx.router && ctx.chatSession) {
        await handleWithRouter(next.fullPrompt, ctx.chatSession, ctx.router, layout, queueMsgCtx, ctx.compactDeps, ctx.specPlanDeps);
      } else {
        await handleChatFallback(next.fullPrompt, layout, queueMsgCtx);
      }
    } finally {
      state.agentBusy = false;
      // Re-trigger draining so a chain of queued prompts plays out one
      // at a time. Same reasoning as the message-case finally above.
      ctx.onQueueDrain?.();
    }
  };

  ctx.onQueueDrain = () => void processNextFromQueue();

  // TUI abort handler
  layout.tui.onAbort = () => {
    if (ctx.cleanupRouter?.isStreaming()) {
      ctx.cleanupRouter.cancelStreaming();
      state.agentBusy = false;
      layout.tui.onFlashMessage?.("Cancelled");
      return true;
    }
    if (state.queue.length > 0) {
      layout.messages.removePendingMessages();
      state.queue.length = 0;
      layout.divider.setLabel(null);
      layout.tui.requestRender();
      return true;
    }
    return false;
  };
}
