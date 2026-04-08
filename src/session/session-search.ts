/**
 * Full-text search across session messages.
 */

import { Result, ok, err } from "neverthrow";
import type { SessionStore } from "./session-store.js";
import type { SessionError } from "./session-state.js";

export interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  messageIndex: number;
  messageRole: string;
  agentId?: string;
  snippet: string;
  timestamp: string;
  matchCount: number;
}

export class SessionSearch {
  constructor(private store: SessionStore) {}

  async search(
    query: string,
    options?: { sessionId?: string; limit?: number; includeArchived?: boolean },
  ): Promise<Result<SearchResult[], SessionError>> {
    if (query.length < 2) return ok([]);

    const limit = options?.limit ?? 20;
    const results: SearchResult[] = [];
    const lower = query.toLowerCase();

    const listResult = await this.store.list({
      status: options?.sessionId ? undefined : (options?.includeArchived === false ? "active" : undefined),
      limit: 50,
    });
    if (listResult.isErr()) return err(listResult.error);

    for (const item of listResult.value) {
      if (options?.sessionId && item.id !== options.sessionId) continue;
      if (results.length >= limit) break;

      const loadResult = await this.store.load(item.id);
      if (loadResult.isErr()) continue;

      const session = loadResult.value;
      const messages = session.messages;

      for (let i = 0; i < messages.length; i++) {
        if (results.length >= limit) break;
        const msg = messages[i]!;
        const contentLower = msg.content.toLowerCase();
        if (!contentLower.includes(lower)) continue;

        const pos = contentLower.indexOf(lower);
        const start = Math.max(0, pos - 40);
        const end = Math.min(msg.content.length, pos + query.length + 40);
        const snippet = (start > 0 ? "..." : "") + msg.content.slice(start, end) + (end < msg.content.length ? "..." : "");

        let matchCount = 0;
        let idx = 0;
        while ((idx = contentLower.indexOf(lower, idx)) !== -1) { matchCount++; idx += lower.length; }

        results.push({
          sessionId: item.id,
          sessionTitle: item.title,
          messageIndex: i,
          messageRole: msg.role,
          agentId: msg.agentId,
          snippet,
          timestamp: msg.timestamp,
          matchCount,
        });
      }
    }

    return ok(results.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  }
}
