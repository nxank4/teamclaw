/**
 * Auto-generate session titles from first user message.
 */

import type { Session } from "./session.js";

export class AutoTitler {
  async generateTitle(firstMessage: string): Promise<string> {
    // v1: simple truncation. Future: use cheapest LLM for 3-6 word summary.
    let cleaned = firstMessage.replace(/\n/g, " ").trim();
    // Strip common prefixes
    cleaned = cleaned.replace(/^(help me |please |i want to |can you |i need to )/i, "");
    cleaned = cleaned.trim();

    if (cleaned.length <= 50) return cleaned;
    // Truncate at word boundary
    const truncated = cleaned.slice(0, 50);
    const lastSpace = truncated.lastIndexOf(" ");
    return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "...";
  }

  async titleSession(session: Session, firstMessage: string): Promise<void> {
    if (session.getState().title !== "New session") return;
    const title = await this.generateTitle(firstMessage);
    session.setTitle(title);
  }
}
