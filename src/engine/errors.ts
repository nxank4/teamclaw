/**
 * Two-layer error system.
 * Layer 1: User-friendly message + quick fixes (always shown).
 * Layer 2: Technical details — error codes, HTTP responses, config snapshot (via /error).
 */

export type ErrorCode =
  | "NO_PROVIDER"
  | "NO_API_KEY"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "ALL_PROVIDERS_FAILED"
  | "MODEL_NOT_FOUND"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CONTEXT_LENGTH_EXCEEDED"
  | "TOOL_EXECUTION_FAILED"
  | "TASK_ABORTED"
  | "CONFIG_INVALID"
  | "UNKNOWN";

export interface QuickFix {
  command: string;
  description: string;
}

export interface TechnicalDetail {
  providerErrors?: { provider: string; status?: number; message: string; endpoint?: string; response?: string }[];
  configSnapshot?: Record<string, string>;
  timestamp: string;
  sessionId?: string;
  stack?: string;
}

export interface OpenPawlError {
  code: ErrorCode;
  userMessage: string;
  quickFixes: QuickFix[];
  technical: TechnicalDetail;
  cause?: Error;
}

function maskKey(key: string): string {
  if (!key) return "(not set)";
  if (key.length <= 8) return "****";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

function envVar(provider?: string): string {
  const map: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return map[provider ?? ""] ?? "API_KEY";
}

function now(): string {
  return new Date().toISOString();
}

export function createError(
  code: ErrorCode,
  opts: {
    cause?: Error;
    provider?: string;
    model?: string;
    apiKey?: string;
    details?: Partial<TechnicalDetail>;
  } = {},
): OpenPawlError {
  const { cause, provider, model, apiKey, details } = opts;
  const masked = maskKey(apiKey ?? "");

  switch (code) {
    case "NO_PROVIDER":
      return {
        code,
        userMessage: "No AI provider configured.",
        quickFixes: [
          { command: "/settings provider anthropic", description: "Set up Anthropic (Claude)" },
          { command: "/settings provider openai", description: "Set up OpenAI (GPT)" },
          { command: "/settings", description: "See all settings" },
        ],
        technical: { timestamp: now(), ...details },
      };

    case "NO_API_KEY":
      return {
        code,
        userMessage: `No API key for ${provider ?? "your provider"}.`,
        quickFixes: [
          { command: "/settings apikey <your-key>", description: "Add your API key" },
          { command: `export ${envVar(provider)}=<key>`, description: "Or set environment variable" },
        ],
        technical: { timestamp: now(), ...details },
      };

    case "AUTH_FAILED":
      return {
        code,
        userMessage: `Authentication failed with ${provider ?? "provider"}.`,
        quickFixes: [
          { command: "/settings apikey <new-key>", description: "Update your API key" },
          { command: "/settings", description: `Current key: ${masked}` },
        ],
        technical: {
          timestamp: now(),
          configSnapshot: { provider: provider ?? "", model: model ?? "", apikey: masked },
          ...details,
        },
        cause,
      };

    case "RATE_LIMITED":
      return {
        code,
        userMessage: `Rate limited by ${provider ?? "provider"}. Waiting before retry.`,
        quickFixes: [
          { command: "", description: "Wait a moment — OpenPawl will retry automatically" },
          { command: "/settings provider openai", description: "Switch to a different provider" },
        ],
        technical: { timestamp: now(), ...details },
        cause,
      };

    case "ALL_PROVIDERS_FAILED":
      return {
        code,
        userMessage: "Cannot connect to your AI provider.",
        quickFixes: [
          { command: "/settings", description: "Check your configuration" },
          { command: "/settings apikey <key>", description: "Update API key" },
          { command: "/settings provider <name>", description: "Try a different provider" },
        ],
        technical: {
          timestamp: now(),
          configSnapshot: { provider: provider ?? "", model: model ?? "", apikey: masked },
          ...details,
        },
        cause,
      };

    case "MODEL_NOT_FOUND":
      return {
        code,
        userMessage: `Model "${model}" not found on ${provider ?? "provider"}.`,
        quickFixes: [
          { command: "/model", description: "See available models" },
          { command: "/settings model claude-sonnet-4-20250514", description: "Use a known model" },
        ],
        technical: { timestamp: now(), ...details },
        cause,
      };

    case "NETWORK_ERROR":
      return {
        code,
        userMessage: "Network error — cannot reach the AI provider.",
        quickFixes: [
          { command: "", description: "Check your internet connection" },
          { command: "", description: "If behind a proxy, configure HTTP_PROXY env var" },
        ],
        technical: { timestamp: now(), ...details },
        cause,
      };

    case "TIMEOUT":
      return {
        code,
        userMessage: "Request timed out. The AI provider took too long to respond.",
        quickFixes: [
          { command: "", description: "Try again — could be temporary" },
          { command: "/model", description: "Try a faster model" },
        ],
        technical: { timestamp: now(), ...details },
        cause,
      };

    case "CONTEXT_LENGTH_EXCEEDED":
      return {
        code,
        userMessage: "Your conversation is too long for this model.",
        quickFixes: [
          { command: "/clear", description: "Start a new session" },
          { command: "/model", description: "Use a model with larger context" },
        ],
        technical: { timestamp: now(), ...details },
        cause,
      };

    case "TOOL_EXECUTION_FAILED":
      return {
        code,
        userMessage: `A tool failed: ${cause?.message ?? "unknown error"}`,
        quickFixes: [
          { command: "", description: "The agent will try to recover automatically" },
        ],
        technical: { timestamp: now(), stack: cause?.stack, ...details },
        cause,
      };

    case "TASK_ABORTED":
      return {
        code,
        userMessage: "Task was aborted.",
        quickFixes: [],
        technical: { timestamp: now(), ...details },
      };

    default:
      return {
        code: "UNKNOWN",
        userMessage: cause?.message ?? "Something went wrong.",
        quickFixes: [{ command: "/error", description: "Show technical details" }],
        technical: { timestamp: now(), stack: cause?.stack, ...details },
        cause,
      };
  }
}

/** Translate a raw Error into an OpenPawlError by inspecting its shape. */
export function translateError(err: unknown, provider?: string, model?: string, apiKey?: string): OpenPawlError {
  if (!(err instanceof Error)) {
    return createError("UNKNOWN", { cause: new Error(String(err)) });
  }

  const msg = err.message;
  const status = "status" in err ? (err as { status: number }).status : undefined;

  if (status === 401 || msg.includes("401") || msg.includes("auth") || msg.includes("Unauthorized")) {
    return createError("AUTH_FAILED", { cause: err, provider, model, apiKey });
  }
  if (status === 429 || msg.includes("429") || msg.includes("rate")) {
    return createError("RATE_LIMITED", { cause: err, provider });
  }
  if (status === 404 || msg.includes("model") && msg.includes("not found")) {
    return createError("MODEL_NOT_FOUND", { cause: err, provider, model });
  }
  if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("fetch failed") || msg.includes("ENOTFOUND")) {
    return createError("NETWORK_ERROR", { cause: err, provider });
  }
  if (msg.includes("context_length") || msg.includes("max_tokens") || msg.includes("too long")) {
    return createError("CONTEXT_LENGTH_EXCEEDED", { cause: err, provider, model });
  }
  if (msg.includes("provider") && (msg.includes("No ") || msg.includes("configured"))) {
    return createError("ALL_PROVIDERS_FAILED", { cause: err, provider, model, apiKey });
  }

  return createError("UNKNOWN", { cause: err });
}
