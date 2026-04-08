/**
 * Abort management per session and per agent.
 */

export class StreamAbortManager {
  private sessionControllers = new Map<string, AbortController>();
  private agentControllers = new Map<string, AbortController>(); // key: sessionId:agentId

  createForSession(sessionId: string): AbortController {
    const controller = new AbortController();
    this.sessionControllers.set(sessionId, controller);
    return controller;
  }

  createForAgent(sessionId: string, agentId: string): AbortController {
    const child = new AbortController();
    const key = `${sessionId}:${agentId}`;
    this.agentControllers.set(key, child);

    // Link to parent session controller
    const parent = this.sessionControllers.get(sessionId);
    if (parent) {
      parent.signal.addEventListener("abort", () => child.abort(), { once: true });
    }

    return child;
  }

  abortAgent(sessionId: string, agentId: string): void {
    const key = `${sessionId}:${agentId}`;
    this.agentControllers.get(key)?.abort();
  }

  abortSession(sessionId: string): void {
    this.sessionControllers.get(sessionId)?.abort();
  }

  cleanup(sessionId: string): void {
    this.sessionControllers.delete(sessionId);
    // Remove all agent controllers for this session
    for (const key of [...this.agentControllers.keys()]) {
      if (key.startsWith(`${sessionId}:`)) {
        this.agentControllers.delete(key);
      }
    }
  }

  isAborted(sessionId: string, agentId?: string): boolean {
    if (agentId) {
      const key = `${sessionId}:${agentId}`;
      const agent = this.agentControllers.get(key);
      if (agent?.signal.aborted) return true;
    }
    return this.sessionControllers.get(sessionId)?.signal.aborted ?? false;
  }
}
