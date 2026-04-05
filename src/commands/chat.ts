/**
 * CLI command: openpawl chat
 * Interactive chat mode using the prompt router and session manager.
 * Placeholder readline loop — TUI (B1) will replace this.
 */

import { createInterface } from "node:readline";
import { logger } from "../core/logger.js";
import { createSessionManager } from "../session/index.js";
import { PromptRouter } from "../router/index.js";

export async function runChatCommand(_args: string[]): Promise<void> {
  const sessionManager = createSessionManager();
  await sessionManager.initialize();

  const router = new PromptRouter({}, sessionManager);
  await router.initialize();

  // Resume latest session or create new
  const latestResult = await sessionManager.resumeLatest();
  let session = latestResult.isOk() ? latestResult.value : null;

  if (!session) {
    const createResult = await sessionManager.create(process.cwd());
    if (createResult.isErr()) {
      logger.error(`Failed to create session: ${createResult.error.type}`);
      return;
    }
    session = createResult.value;
  }

  logger.plain(`Session: ${session.id} — ${session.getState().title}`);
  logger.plain('Type /help for commands. Press Ctrl+C to exit.\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const result = await router.route(session!.id, trimmed);
    if (result.isOk()) {
      for (const agentResult of result.value.agentResults) {
        const prefix = agentResult.agentId !== "system" ? `[${agentResult.agentId}] ` : "";
        logger.plain(`${prefix}${agentResult.response}`);
      }
    } else {
      logger.error(`Error: ${result.error.type}`);
    }

    logger.plain("");
    rl.prompt();
  });

  rl.on("close", async () => {
    await router.shutdown();
    await sessionManager.shutdown();
  });
}
