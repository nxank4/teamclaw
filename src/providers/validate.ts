import { ok, err, type Result } from "neverthrow";

export interface ValidationSuccess {
  latencyMs: number;
}

export interface ValidationError {
  message: string;
}

const VALIDATE_TIMEOUT_MS = 5_000;

function getHealthEndpoint(
  providerType: string,
  baseUrl: string,
): { url: string; headers: Record<string, string> } {
  if (providerType === "ollama") {
    return { url: `${baseUrl}/api/tags`, headers: {} };
  }
  if (providerType === "anthropic") {
    return { url: `${baseUrl}/v1/models`, headers: {} };
  }
  return { url: `${baseUrl.replace(/\/+$/, "")}/models`, headers: {} };
}

export async function validateApiKey(
  providerType: string,
  apiKey: string,
  baseUrl: string,
): Promise<Result<ValidationSuccess, ValidationError>> {
  const { url, headers } = getHealthEndpoint(providerType, baseUrl);

  if (apiKey) {
    if (providerType === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return err({ message: `Provider returned ${res.status} — check your API key` });
    }
    return ok({ latencyMs });
  } catch (e) {
    return err({ message: (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
}
