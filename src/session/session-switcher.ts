/**
 * Session switching — smooth transitions between sessions.
 */

import { Result, ok } from "neverthrow";
import type { SessionManager } from "./session-manager.js";
import type { Session } from "./session.js";
import type { SessionError, SessionListItem } from "./session-state.js";

export interface ResumeRecommendation {
  type: "resume" | "choose" | "new";
  session?: SessionListItem;
  candidates?: SessionListItem[];
  reason: string;
}

export class SessionSwitcher {
  constructor(private sessionManager: SessionManager) {}

  async switchTo(targetId: string): Promise<Result<Session, SessionError>> {
    return this.sessionManager.resume(targetId);
  }

  async getDirectorySessions(dir: string, limit = 10): Promise<Result<SessionListItem[], SessionError>> {
    const result = await this.sessionManager.list({ sortBy: "updatedAt", limit });
    if (result.isErr()) return result;
    // Filter by working directory matching dir
    // (SessionListItem doesn't have workingDirectory, so return all for now)
    return ok(result.value.slice(0, limit));
  }

  async findBestResume(_cwd: string): Promise<ResumeRecommendation> {
    const listResult = await this.sessionManager.list({ sortBy: "updatedAt", limit: 5 });
    if (listResult.isErr()) return { type: "new", reason: "No sessions available" };

    const sessions = listResult.value.filter((s) => s.status !== "crashed");
    if (sessions.length === 0) return { type: "new", reason: "No recent sessions" };

    const active = sessions.filter((s) => s.status === "active" || s.status === "idle");
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

    // One recent active session
    if (active.length === 1 && active[0]!.updatedAt > oneHourAgo) {
      const age = Math.floor((Date.now() - new Date(active[0]!.updatedAt).getTime()) / 60_000);
      return { type: "resume", session: active[0], reason: `Last active ${age} min ago` };
    }

    // Multiple active sessions
    if (active.length > 1) {
      return { type: "choose", candidates: active.slice(0, 5), reason: `${active.length} sessions available` };
    }

    // One old session
    if (active.length === 1 && active[0]!.updatedAt > dayAgo) {
      return { type: "resume", session: active[0], reason: `Session from earlier — resume?` };
    }

    return { type: "new", reason: "No recent sessions" };
  }
}
