import { getGlobalProviderManager } from "../providers/provider-factory.js";
import { resolveModelForAgent } from "./model-config.js";

export type HealthLevel = "healthy" | "degraded" | "dead";
export type CheckLevel = "pass" | "warn" | "fail";

export interface HealthCheckResult {
  name: string;
  level: CheckLevel;
  message: string;
  latencyMs?: number;
}

export interface GatewayHealthReport {
  status: HealthLevel;
  gatewayUrl: string;
  protocol: "http" | "ws";
  latency: number;
  authStatus: "valid" | "invalid" | "unknown";
  checks: HealthCheckResult[];
  tip?: string;
}

function summarizeStatus(checks: HealthCheckResult[]): HealthLevel {
  if (checks.some((c) => c.level === "fail")) return "dead";
  if (checks.some((c) => c.level === "warn")) return "degraded";
  return "healthy";
}

export async function runGatewayHealthCheck(): Promise<GatewayHealthReport> {
  const checks: HealthCheckResult[] = [];
  const pm = getGlobalProviderManager();
  const providers = pm.getProviders();

  if (providers.length === 0) {
    return {
      status: "dead",
      gatewayUrl: "(no providers)",
      protocol: "http",
      latency: -1,
      authStatus: "unknown",
      checks: [{ name: "providers", level: "fail", message: "No LLM providers configured" }],
      tip: "Tip: Run `teamclaw setup` to configure an LLM provider.",
    };
  }

  let anyHealthy = false;
  let latency = -1;

  for (const provider of providers) {
    try {
      const started = Date.now();
      const healthy = await provider.healthCheck();
      const elapsed = Date.now() - started;
      if (latency < 0) latency = elapsed;

      if (healthy) {
        anyHealthy = true;
        checks.push({
          name: `provider:${provider.name}`,
          level: "pass",
          message: `${provider.name} is available`,
          latencyMs: elapsed,
        });
      } else {
        checks.push({
          name: `provider:${provider.name}`,
          level: "warn",
          message: `${provider.name} health check failed`,
          latencyMs: elapsed,
        });
      }
    } catch (err) {
      checks.push({
        name: `provider:${provider.name}`,
        level: "warn",
        message: `${provider.name}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const model = resolveModelForAgent("default");
  if (!model) {
    checks.push({
      name: "model",
      level: "warn",
      message: "Default model is not set",
    });
  }

  const status = summarizeStatus(checks);
  return {
    status,
    gatewayUrl: providers.map((p) => p.name).join(", "),
    protocol: "http",
    latency,
    authStatus: anyHealthy ? "valid" : "unknown",
    checks,
  };
}
