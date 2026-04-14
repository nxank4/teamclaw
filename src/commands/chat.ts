/**
 * CLI command: openpawl solo (aliased as openpawl chat)
 * Launches the interactive TUI with SessionManager + PromptRouter.
 * Alias for `openpawl` with no args.
 */

import { logger } from "../core/logger.js";

export async function runChatCommand(_args: string[]): Promise<void> {
  if (!process.stdin.isTTY) {
    logger.error("Solo mode requires an interactive terminal. Use `openpawl -p <prompt>` for non-interactive mode.");
    return;
  }

  const { launchTUI } = await import("../app/index.js");
  await launchTUI();
}
