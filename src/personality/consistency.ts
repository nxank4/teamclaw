import { getPersonality, NEUTRAL_PERSONALITY } from "./profiles.js";

const HEDGING_PHRASES = [
  "might",
  "perhaps",
  "could potentially",
  "maybe we should",
  "it seems like",
  "we could consider",
];

const CONCLUSIVE_PHRASES = [
  "decision",
  "decided",
  "making a call",
  "moving forward",
  "ship it",
  "let's go with",
];

const DATA_REFERENCES = [
  "test",
  "coverage",
  "confidence",
  "score",
  "metric",
  "benchmark",
];

export function enforcePersonalityConsistency(
  output: string,
  role: string,
): string {
  const personality = getPersonality(role);
  if (personality === NEUTRAL_PERSONALITY) return output;

  const lower = output.toLowerCase();

  switch (role) {
    case "tech-lead": {
      const hedgeCount = HEDGING_PHRASES.filter((p) => lower.includes(p)).length;
      if (hedgeCount > 2 && personality.catchphrases.length > 0) {
        return output + `\n\nTo be direct: ${personality.catchphrases[0]}`;
      }
      break;
    }

    case "rfc-author": {
      if (!output.includes("?") && personality.catchphrases.length > 0) {
        return output + `\n\nBefore proceeding: ${personality.catchphrases[0]}`;
      }
      break;
    }

    case "coordinator": {
      const hasConclusion = CONCLUSIVE_PHRASES.some((p) => lower.includes(p));
      if (!hasConclusion && personality.catchphrases.length > 0) {
        return output + `\n\n${personality.catchphrases[0]}`;
      }
      break;
    }

    case "qa-reviewer": {
      const hasData = DATA_REFERENCES.some((p) => lower.includes(p));
      if (!hasData && personality.catchphrases.length > 0) {
        return output + `\n\n${personality.catchphrases[0]}`;
      }
      break;
    }
  }

  return output;
}
