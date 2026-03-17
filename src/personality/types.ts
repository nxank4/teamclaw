import type { Decision } from "../journal/types.js";

export type PersonalityTrait =
  | "pragmatic"
  | "thorough"
  | "decisive"
  | "skeptical"
  | "forward_thinking"
  | "quality_focused"
  | "efficiency_oriented";

export interface CommunicationStyle {
  tone: "direct" | "collaborative" | "inquisitive" | "authoritative";
  verbosity: "concise" | "moderate" | "detailed";
  usesQuestions: boolean;
  pushbackStyle: "firm" | "diplomatic" | "data_driven";
}

export interface AgentOpinion {
  topic: string;
  stance: string;
  strength: "strong" | "moderate" | "mild";
}

export interface PushbackTrigger {
  pattern: string;
  response: string;
  severity: "block" | "warn" | "note";
}

export interface AgentPersonality {
  role: string;
  traits: PersonalityTrait[];
  communicationStyle: CommunicationStyle;
  opinions: AgentOpinion[];
  pushbackTriggers: PushbackTrigger[];
  catchphrases: string[];
}

export interface PushbackResult {
  triggered: boolean;
  triggers: PushbackTrigger[];
  response: string;
  severity: "block" | "warn" | "note";
  agentRole: string;
}

export interface PersonalityEvent {
  id: string;
  agentRole: string;
  eventType: "pushback" | "opinion" | "decision_influenced" | "catchphrase";
  sessionId: string;
  content: string;
  relatedTaskId?: string;
  createdAt: number;
}

export interface PersonalityContext {
  recentEvents: PersonalityEvent[];
  decisionJournalEntries?: Decision[];
  agentProfileTrend?: "improving" | "stable" | "degrading";
}

export interface PersonalityConfig {
  enabled: boolean;
  pushbackEnabled: boolean;
  coordinatorIntervention: boolean;
  agentOverrides: Record<string, { enabled: boolean }>;
}

export interface CoordinatorInterventionResult {
  message: string;
  taskId: string;
  visitCount: number;
}

export interface PersonalityEventSummary {
  agentRole: string;
  eventType: string;
  content: string;
  severity: string | null;
  timestamp: number;
}
