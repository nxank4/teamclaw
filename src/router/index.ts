/**
 * Prompt Router module — classifies user intent and dispatches to agents.
 */

// Types
export type {
  IntentCategory,
  PromptIntent,
  DispatchStrategy,
  AgentAssignment,
  RouteDecision,
  AgentDefinition,
  AgentMention,
  MentionParseResult,
  ToolCallSummary,
  AgentResult,
  DispatchResult,
  RouterError,
} from "./router-types.js";

// Mention parser
export { parseMentions } from "./mention-parser.js";

// Agent registry
export { AgentRegistry } from "./agent-registry.js";

// Intent classifier
export { IntentClassifier, IntentClassificationSchema } from "./intent-classifier.js";
export type { ClassifierLLM, ClassifierContext } from "./intent-classifier.js";

// Agent resolver
export { AgentResolver } from "./agent-resolver.js";
export type { ResolverContext } from "./agent-resolver.js";

// Dispatcher
export { Dispatcher } from "./dispatch-strategy.js";
export type { AgentRunner, DispatcherEvents } from "./dispatch-strategy.js";

// Prompt router (main entry)
export { PromptRouter } from "./prompt-router.js";
export type { PromptRouterConfig } from "./prompt-router.js";
