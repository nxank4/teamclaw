import { Result, ok, err } from "neverthrow";

// Discriminated union of provider errors (for new Result-based APIs)
export type ProviderErrorType =
  | { type: "rate_limit";       provider: string; retryAfterMs?: number }
  | { type: "timeout";          provider: string; timeoutMs: number }
  | { type: "auth_failed";      provider: string; message: string }
  | { type: "model_not_found";  provider: string; model: string }
  | { type: "context_too_long"; provider: string; maxTokens: number }
  | { type: "invalid_response"; provider: string; raw: string }
  | { type: "network";          provider: string; message: string }
  | { type: "unknown";          provider: string; cause: unknown };

export type SandboxError =
  | { type: "timeout";     durationMs: number }
  | { type: "memory";      limitMb: number }
  | { type: "permission";  resource: string }
  | { type: "init_failed"; message: string };

export type ConfigError =
  | { type: "missing_provider"; name: string }
  | { type: "invalid_key";     provider: string; key: string }
  | { type: "invalid_config";  field: string; message: string };

// Result type aliases
export type ProviderResult<T> = Result<T, ProviderErrorType>;
export type SandboxResult<T> = Result<T, SandboxError>;
export type ConfigResult<T> = Result<T, ConfigError>;

// Re-export for convenience
export { ok, err } from "neverthrow";

// Classify a caught error into ProviderErrorType
export function classifyProviderError(providerId: string, e: unknown): ProviderErrorType {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429"))
      return { type: "rate_limit", provider: providerId };
    if (msg.includes("timeout") || msg.includes("timed out"))
      return { type: "timeout", provider: providerId, timeoutMs: 15000 };
    if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("authentication"))
      return { type: "auth_failed", provider: providerId, message: e.message };
    if (msg.includes("context") || msg.includes("too long") || msg.includes("tokens"))
      return { type: "context_too_long", provider: providerId, maxTokens: 0 };
    if (msg.includes("model") && msg.includes("not found"))
      return { type: "model_not_found", provider: providerId, model: "" };
    return { type: "network", provider: providerId, message: e.message };
  }
  return { type: "unknown", provider: providerId, cause: e };
}

// Safe wrapper for async operations that returns Result
export async function safeAsync<T>(
  providerId: string,
  fn: () => Promise<T>,
): Promise<ProviderResult<T>> {
  try {
    const result = await fn();
    return ok(result);
  } catch (e: unknown) {
    return err(classifyProviderError(providerId, e));
  }
}
