export type {
  PersonalityTrait,
  CommunicationStyle,
  AgentOpinion,
  PushbackTrigger,
  AgentPersonality,
  PushbackResult,
  PersonalityEvent,
  PersonalityContext,
  PersonalityConfig,
  CoordinatorInterventionResult,
  PersonalityEventSummary,
} from "./types.js";

export {
  PERSONALITY_PROFILES,
  NEUTRAL_PERSONALITY,
  getPersonality,
} from "./profiles.js";

export { withPersonality } from "./injector.js";
export { detectPushback } from "./pushback.js";
export { enforcePersonalityConsistency } from "./consistency.js";
export { PersonalityEventStore } from "./memory.js";
export { detectCoordinatorIntervention } from "./coordinator-intervention.js";
