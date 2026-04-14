import { getPersonality, NEUTRAL_PERSONALITY } from "./profiles.js";
import type { PersonalityContext } from "./types.js";

export function withPersonality(
  prompt: string,
  role: string,
  context?: PersonalityContext,
): string {
  const personality = getPersonality(role);
  if (personality === NEUTRAL_PERSONALITY) return prompt;

  const { traits, communicationStyle, opinions, catchphrases } = personality;
  const style = communicationStyle;

  const topOpinions = opinions
    .slice(0, 3)
    .map((o) => `- ${o.topic}: ${o.stance}`)
    .join("\n");

  const phrases = catchphrases.slice(0, 2).map((c) => `"${c}"`).join(", ");

  let block = `## Your Character
You are the ${role}. Traits: ${traits.join(", ")}.
Communication: ${style.tone}, ${style.verbosity}. ${style.pushbackStyle} when pushing back.
Strong opinions:
${topOpinions}
When you see shortcuts or workarounds, push back firmly.
Stay in character. Use phrases like: ${phrases}`;

  if (context?.recentEvents?.length) {
    const events = context.recentEvents.slice(0, 2);
    for (const evt of events) {
      block += `\nPreviously: ${evt.content}`;
    }
  }

  if (context?.decisionJournalEntries?.length) {
    const d = context.decisionJournalEntries[0];
    block += `\nReference past decision: ${d.topic} — ${d.decision}`;
  }

  if (context?.agentProfileTrend === "degrading") {
    block += `\nNote: Your recent confidence has been lower — be more careful and thorough.`;
  }

  // Insert after first paragraph break, or append at end
  const paragraphBreak = prompt.indexOf("\n\n");
  if (paragraphBreak !== -1) {
    return prompt.slice(0, paragraphBreak) + "\n\n" + block + prompt.slice(paragraphBreak);
  }
  return prompt + "\n\n" + block;
}
