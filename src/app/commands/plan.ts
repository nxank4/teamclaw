/**
 * /plan command — ask the agent to create a plan before executing.
 * Sends a system message instructing read-only exploration and planning.
 */
import type { SlashCommand } from "../../tui/index.js";
import { ICONS } from "../../tui/constants/icons.js";

export interface PlanCommandDeps {
  flashMessage: (msg: string) => void;
}

export const PLAN_SYSTEM_MESSAGE = [
  "**Plan mode active.** Explore the codebase and create a detailed plan.",
  "",
  "Read files, list directories, and search — then present your plan.",
  "When the plan is ready, ask for confirmation before executing.",
].join("\n");

export function createPlanCommand(deps: PlanCommandDeps): SlashCommand {
  return {
    name: "plan",
    description: "Ask the agent to plan before executing",
    async execute(_args, ctx) {
      ctx.addMessage("system", PLAN_SYSTEM_MESSAGE);
      deps.flashMessage(`${ICONS.bolt} Plan mode`);
    },
  };
}
