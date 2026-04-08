import { PROVIDER_CATALOG } from "./provider-catalog.js";

export interface DetectedProvider {
  type: string;
  available: boolean;
  models?: string[];
  source: "env" | "ollama" | "lmstudio" | "config";
  envKey?: string;
}

const PROBE_TIMEOUT_MS = 3_000;

async function probeLocal(
  url: string,
  modelsPath: string,
  source: "ollama" | "lmstudio",
): Promise<DetectedProvider | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${modelsPath}`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const models = extractModelNames(json, source);
    return { type: source, available: true, models, source };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractModelNames(json: Record<string, unknown>, source: string): string[] {
  if (source === "ollama" && Array.isArray(json.models)) {
    return (json.models as Array<{ name: string }>).map((m) => m.name);
  }
  if (Array.isArray(json.data)) {
    return (json.data as Array<{ id: string }>).map((m) => m.id);
  }
  return [];
}

function detectEnvProviders(): DetectedProvider[] {
  const found: DetectedProvider[] = [];
  const seen = new Set<string>();

  for (const [providerId, meta] of Object.entries(PROVIDER_CATALOG)) {
    for (const envKey of meta.envKeys) {
      if (process.env[envKey] && !seen.has(providerId)) {
        seen.add(providerId);
        found.push({ type: providerId, available: true, source: "env", envKey });
      }
    }
  }
  return found;
}

export async function detectProviders(): Promise<DetectedProvider[]> {
  const [ollamaResult, lmStudioResult] = await Promise.allSettled([
    probeLocal("http://localhost:11434", "/api/tags", "ollama"),
    probeLocal("http://localhost:1234", "/v1/models", "lmstudio"),
  ]);

  const detected: DetectedProvider[] = [];

  const ollama = ollamaResult.status === "fulfilled" ? ollamaResult.value : null;
  detected.push(ollama ?? { type: "ollama", available: false, source: "ollama" });

  const lmStudio = lmStudioResult.status === "fulfilled" ? lmStudioResult.value : null;
  if (lmStudio) detected.push(lmStudio);

  detected.push(...detectEnvProviders());

  detected.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));

  return detected;
}
