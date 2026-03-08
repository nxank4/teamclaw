/**
 * TeamClaw project config (teamclaw.config.json).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface TeamConfig {
  template?: string;
  workers?: Record<string, string>;
  worker_url?: string;
  gateway_url?: string;
  team_model?: string;
  bots?: Array<{ id: string; role_id: string; name?: string; worker_url?: string }>;
  goal?: string;
  creativity?: number;
  webhooks?: {
    on_task_complete?: string;
    on_cycle_end?: string;
  };
}

let _cached: TeamConfig | null | undefined;

export async function loadTeamConfig(): Promise<TeamConfig | null> {
  if (_cached !== undefined) return _cached;
  try {
    const raw = await readFile(path.join(process.cwd(), "teamclaw.config.json"), "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const creativity =
      typeof parsed.creativity === "number"
        ? Math.max(0, Math.min(1, parsed.creativity))
        : undefined;
    _cached = {
      template: typeof parsed.template === "string" ? parsed.template : undefined,
      worker_url: typeof parsed.worker_url === "string" ? parsed.worker_url : undefined,
      gateway_url: typeof parsed.gateway_url === "string" ? parsed.gateway_url : undefined,
      team_model: typeof parsed.team_model === "string" ? parsed.team_model : undefined,
      workers:
        parsed.workers && typeof parsed.workers === "object" && !Array.isArray(parsed.workers)
          ? (parsed.workers as Record<string, string>)
          : undefined,
      bots: Array.isArray(parsed.bots) ? (parsed.bots as TeamConfig["bots"]) : undefined,
      goal: typeof parsed.goal === "string" ? parsed.goal : undefined,
      creativity,
    };
  } catch {
    _cached = null;
  }
  return _cached;
}

export function clearTeamConfigCache(): void {
  _cached = undefined;
}
