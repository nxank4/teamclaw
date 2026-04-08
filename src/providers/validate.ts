import { ok, err, type Result } from "neverthrow";

export interface ValidationSuccess {
  latencyMs: number;
  warning?: string;
}

export interface ValidationError {
  message: string;
}

const VALIDATE_TIMEOUT_MS = 5_000;
const OPENCODE_VALIDATE_TIMEOUT_MS = 15_000;

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

/**
 * Validate an OpenCode API key via a minimal /messages call (Anthropic format).
 * The /models endpoint is public so it can't validate keys.
 * A CreditsError response means the key is valid but has no balance.
 */
async function validateOpenCode(
  providerType: string,
  apiKey: string,
  baseUrl: string,
): Promise<Result<ValidationSuccess, ValidationError>> {
  const url = `${baseUrl.replace(/\/+$/, "")}/messages`;
  const model = providerType === "opencode-go" ? "minimax-m2.5" : "minimax-m2.5-free";
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENCODE_VALIDATE_TIMEOUT_MS);
  try {
    // Try x-api-key (Anthropic format) first, fall back to Bearer
    let res = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: controller.signal,
    });

    // If x-api-key auth returned 401, try Bearer auth
    if (res.status === 401) {
      let body: { error?: { type?: string } } | null = null;
      try { body = await res.json() as { error?: { type?: string } }; } catch { /* */ }
      // Only retry if it's not a CreditsError (which means key IS valid)
      if (body?.error?.type !== "CreditsError") {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "content-type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: controller.signal,
        });
      } else {
        // CreditsError with x-api-key — key is valid
        const latencyMs = Math.round(performance.now() - start);
        return ok({
          latencyMs,
          warning: "Valid key but insufficient balance — add credits at opencode.ai",
        });
      }
    }

    const latencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      return ok({ latencyMs });
    }

    // Parse error body to check for CreditsError
    let body: { error?: { type?: string } } | null = null;
    try {
      body = await res.json() as { error?: { type?: string } };
    } catch { /* ignore parse errors */ }

    if (body?.error?.type === "CreditsError") {
      return ok({
        latencyMs,
        warning: "Valid key but insufficient balance — add credits at opencode.ai",
      });
    }

    return err({ message: `Provider returned ${res.status} — check your API key` });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return err({ message: "Validation timed out — check your connection and try again" });
    }
    return err({ message: (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
}

export async function validateApiKey(
  providerType: string,
  apiKey: string,
  baseUrl: string,
): Promise<Result<ValidationSuccess, ValidationError>> {
  // OpenCode: validate via /messages endpoint (models endpoint is public, can't validate keys)
  if (providerType === "opencode-zen" || providerType === "opencode-go") {
    return validateOpenCode(providerType, apiKey, baseUrl);
  }

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
