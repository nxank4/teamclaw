/**
 * Global configuration for TeamClaw.
 * Loads overrides from .env via dotenv.
 */

import "dotenv/config";

function env(key: string, defaultVal: string): string;
function env(key: string, defaultVal: number): number;
function env(key: string, defaultVal: string | number): string | number {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  if (typeof defaultVal === "number") {
    const n = parseFloat(val);
    return Number.isInteger(defaultVal) ? Math.floor(n) : n;
  }
  return val;
}

function envBool(key: string, defaultVal: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  return ["true", "1", "yes"].includes(val.toLowerCase());
}

const gatewayUrlRaw = env("GATEWAY_URL", "") as string;
export const CONFIG = {
  gatewayUrl: gatewayUrlRaw?.trim() ? gatewayUrlRaw.replace(/\/$/, "") : "",
  teamModel: env("TEAM_MODEL", "team-default") as string,
  llmModel: env("OLLAMA_MODEL", "qwen2.5-coder:7b") as string,
  llmTemperature: env("LLM_TEMPERATURE", 0.7) as number,
  creativity: env("CREATIVITY", 0.5) as number,
  llmBaseUrl: env("OLLAMA_BASE_URL", "http://localhost:11434") as string,
  llmTimeoutMs: env("LLM_TIMEOUT_MS", 120_000) as number,

  maxCycles: env("MAX_CYCLES", 10) as number,
  maxRuns: env("MAX_RUNS", env("MAX_GENERATIONS", 5) as number) as number,

  chromadbPersistDir: env("CHROMADB_PERSIST_DIR", "data/vector_store") as string,
  verboseLogging: envBool("VERBOSE_LOGGING", true),

  openclawWorkerUrl: env("OPENCLAW_WORKER_URL", "") as string,
  openclawWorkers: (() => {
    const raw = process.env["OPENCLAW_WORKERS"];
    if (!raw?.trim()) return {} as Record<string, string>;
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })(),
  openclawAuthToken: env("OPENCLAW_AUTH_TOKEN", "") as string,
  openclawProvisionTimeout: env("OPENCLAW_PROVISION_TIMEOUT", 30_000) as number,

  webhookOnTaskComplete: env("WEBHOOK_ON_TASK_COMPLETE", "") as string,
  webhookOnCycleEnd: env("WEBHOOK_ON_CYCLE_END", "") as string,
  webhookSecret: env("WEBHOOK_SECRET", "") as string,
} as const;

export interface SessionConfig {
  creativity?: number;
  max_cycles?: number;
  max_generations?: number;
  worker_url?: string;
  user_goal?: string;
  team_template?: string;
  approval_keywords?: string[];
  gateway_url?: string;
  team_model?: string;
}

const DEFAULT_APPROVAL_KEYWORDS = ["deploy", "release", "production", "critical"];

let sessionOverrides: Partial<SessionConfig> = {};

export function setSessionConfig(overrides: Partial<SessionConfig>): void {
  sessionOverrides = { ...overrides };
}

export function getApprovalKeywords(): string[] {
  return sessionOverrides.approval_keywords ?? DEFAULT_APPROVAL_KEYWORDS;
}

export function getSessionCreativity(): number {
  return sessionOverrides.creativity ?? CONFIG.creativity;
}

export function clearSessionConfig(): void {
  sessionOverrides = {};
}

function creativityToTemperature(creativity: number): number {
  return Math.max(0.2, Math.min(1.5, 0.3 + creativity * 0.9));
}

export function getSessionTemperature(): number {
  return creativityToTemperature(getSessionCreativity());
}

export function getGatewayUrl(): string {
  return sessionOverrides.gateway_url?.trim() ?? CONFIG.gatewayUrl;
}

export function getTeamModel(): string {
  return sessionOverrides.team_model?.trim() ?? CONFIG.teamModel;
}

export function getWorkerUrlsForTeam(
  botIds: string[],
  overrides?: { singleUrl?: string; workers?: Record<string, string> }
): Record<string, string> {
  if (overrides?.workers && Object.keys(overrides.workers).length > 0) {
    return overrides.workers;
  }
  const single = overrides?.singleUrl?.trim() ?? CONFIG.openclawWorkerUrl?.trim();
  if (single) {
    const out: Record<string, string> = {};
    for (const id of botIds) out[id] = single;
    return out;
  }
  if (Object.keys(CONFIG.openclawWorkers).length > 0) return CONFIG.openclawWorkers;
  return {};
}
