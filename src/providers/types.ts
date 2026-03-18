export type ProviderName =
  | "openclaw" // legacy, kept for backward compat
  | "anthropic"
  | "openai"
  | "openrouter"
  | "ollama"
  | "deepseek"
  | "groq"
  | "custom";

export class ProviderError extends Error {
  readonly provider: string;
  readonly code: string;
  readonly statusCode?: number;
  readonly isFallbackTrigger: boolean;
  readonly cause?: unknown;

  constructor(opts: {
    provider: string;
    code: string;
    message: string;
    statusCode?: number;
    isFallbackTrigger: boolean;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "ProviderError";
    this.provider = opts.provider;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.isFallbackTrigger = opts.isFallbackTrigger;
    this.cause = opts.cause;
  }
}

export type ProviderStatEntry = { requests: number; failures: number };

export type ProviderStats = {
  [key: string]: ProviderStatEntry | number;
  fallbacksTriggered: number;
};

export function emptyStats(): ProviderStats {
  return { fallbacksTriggered: 0 };
}
