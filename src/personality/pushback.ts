import { getPersonality, NEUTRAL_PERSONALITY } from "./profiles.js";
import type { PushbackResult, PushbackTrigger } from "./types.js";

const SEVERITY_RANK: Record<PushbackTrigger["severity"], number> = {
  block: 2,
  warn: 1,
  note: 0,
};

export function detectPushback(
  output: string,
  reviewerRole: string,
): PushbackResult {
  const personality = getPersonality(reviewerRole);

  const empty: PushbackResult = {
    triggered: false,
    triggers: [],
    response: "",
    severity: "note",
    agentRole: reviewerRole,
  };

  if (personality === NEUTRAL_PERSONALITY || personality.pushbackTriggers.length === 0) {
    return empty;
  }

  const matched: PushbackTrigger[] = [];
  for (const trigger of personality.pushbackTriggers) {
    try {
      if (new RegExp(trigger.pattern, "i").test(output)) {
        matched.push(trigger);
      }
    } catch {
      // Skip invalid regex patterns
      if (output.toLowerCase().includes(trigger.pattern.toLowerCase())) {
        matched.push(trigger);
      }
    }
  }

  if (matched.length === 0) return empty;

  // Determine worst severity
  let worstSeverity: PushbackTrigger["severity"] = "note";
  let worstRank = -1;
  for (const m of matched) {
    const rank = SEVERITY_RANK[m.severity];
    if (rank > worstRank) {
      worstRank = rank;
      worstSeverity = m.severity;
    }
  }

  const response = matched.map((m) => m.response).join(" ");

  return {
    triggered: true,
    triggers: matched,
    response,
    severity: worstSeverity,
    agentRole: reviewerRole,
  };
}
