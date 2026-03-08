/**
 * TeamClaw - Team orchestration with AI agents.
 */

export { CONFIG } from "./core/config.js";
export type { GameState, TaskRequest, TaskResult, TaskQueueItem, AgentMessage } from "./core/state.js";
export {
  initializeGameState,
  initializeTeamState,
} from "./core/state.js";
export type { BotDefinition, RoleTemplate } from "./core/bot-definitions.js";
export { buildTeamFromTemplate } from "./core/team-templates.js";
export { createTeamOrchestration } from "./core/simulation.js";
