/**
 * Setup wizard — minimal clack-based interactive setup.
 * Adapts flow based on detected environment. Max 4 questions.
 */

import * as clack from "@clack/prompts";
import type { DetectedEnvironment, SetupResult } from "./types.js";

// Hardcoded model lists (fallback when live fetch fails)
const MODELS: Record<string, Array<{ value: string; label: string; hint?: string }>> = {
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4", hint: "recommended — fast + smart" },
    { value: "claude-opus-4-6", label: "Claude Opus 4", hint: "most capable, slower" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "fastest, cheapest" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o", hint: "recommended" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", hint: "fast + cheap" },
    { value: "o3-mini", label: "o3-mini", hint: "reasoning model" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat", hint: "frontier, cheapest" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner", hint: "reasoning model" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", hint: "fast inference" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B", hint: "32K context" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4 (via OR)", hint: "recommended" },
    { value: "openai/gpt-4o", label: "GPT-4o (via OR)" },
    { value: "deepseek/deepseek-chat", label: "DeepSeek (via OR)", hint: "cheapest" },
  ],
  grok: [
    { value: "grok-2", label: "Grok 2", hint: "large context" },
  ],
};

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic (Claude)", hint: "recommended — best coding" },
  { value: "openai", label: "OpenAI (GPT-4o)", hint: "popular all-rounder" },
  { value: "deepseek", label: "DeepSeek", hint: "cheapest frontier model" },
  { value: "groq", label: "Groq", hint: "fastest inference" },
  { value: "openrouter", label: "OpenRouter", hint: "200+ models, one key" },
  { value: "grok", label: "xAI (Grok)", hint: "large context window" },
  { value: "ollama", label: "Ollama (local)", hint: "free, private" },
  { value: "lmstudio", label: "LM Studio (local)", hint: "free, private" },
];

const ENV_VAR_FOR_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  grok: "XAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

const KEY_URL_HINTS: Record<string, string> = {
  anthropic: "console.anthropic.com/api-keys",
  openai: "platform.openai.com/api-keys",
  deepseek: "platform.deepseek.com/api_keys",
  groq: "console.groq.com/keys",
  openrouter: "openrouter.ai/keys",
  grok: "console.x.ai",
};

/**
 * Run the interactive setup wizard.
 * Returns null if user cancelled.
 */
export async function runSetupWizard(
  env: DetectedEnvironment,
): Promise<SetupResult | null> {
  clack.intro("OpenPawl Setup — Your AI team, one prompt away.");

  // Scenario D: existing valid config
  if (env.hasExistingConfig && env.existingConfigValid) {
    const reuse = await clack.confirm({
      message: "Found existing OpenPawl configuration. Use it?",
    });
    if (clack.isCancel(reuse)) return cancelled();
    if (reuse) {
      clack.outro("Using existing config. Entering chat...");
      // Return a minimal result — config will be loaded from disk
      return { provider: "__existing__", model: "__existing__", providerChain: [], additionalProviders: [] };
    }
    // User wants to re-setup — continue to full wizard
  }

  // Scenario A: API key found in environment
  if (env.envKeys.length > 0) {
    const result = await scenarioEnvKeyFound(env);
    if (result === null) return cancelled();
    if (result) return result;
    // If false → user declined, fall through to full wizard
  }

  // Scenario B: Ollama detected
  if (env.ollama?.available) {
    const result = await scenarioOllamaFound(env);
    if (result === null) return cancelled();
    if (result) return result;
  }

  // Scenario C: Full wizard
  return scenarioFullWizard(env);
}

// ─── Scenario A: Env key found ──────────────────────────────────────────────

async function scenarioEnvKeyFound(env: DetectedEnvironment): Promise<SetupResult | null | false> {
  const primary = env.envKeys[0]!;
  clack.log.success(`Found ${primary.envVar} in your environment (${primary.masked})`);

  const useIt = await clack.confirm({
    message: `Use ${primary.provider} as your AI provider?`,
  });
  if (clack.isCancel(useIt)) return null;
  if (!useIt) return false; // Declined, fall through

  const model = await selectModel(primary.provider, null);
  if (model === null) return null;

  clack.outro("Ready! Entering chat...");
  return {
    provider: primary.provider,
    // API key comes from env, don't store it
    model,
    providerChain: [primary.provider],
    additionalProviders: [],
  };
}

// ─── Scenario B: Ollama found ───────────────────────────────────────────────

async function scenarioOllamaFound(env: DetectedEnvironment): Promise<SetupResult | null | false> {
  const modelCount = env.ollama!.models.length;
  clack.log.success(`Found Ollama running with ${modelCount} model${modelCount !== 1 ? "s" : ""}`);

  const useIt = await clack.confirm({
    message: "Use Ollama as your AI provider?",
  });
  if (clack.isCancel(useIt)) return null;
  if (!useIt) return false;

  // Select from Ollama's model list
  const models = env.ollama!.models;
  let model: string;
  if (models.length === 0) {
    clack.log.warn("No models found in Ollama. Pull one with: ollama pull llama3.1");
    return false;
  } else if (models.length === 1) {
    model = models[0]!;
    clack.log.info(`Using model: ${model}`);
  } else {
    const selected = await clack.select({
      message: "Which model?",
      options: models.map((m) => ({ value: m, label: m })),
    });
    if (clack.isCancel(selected)) return null;
    model = selected as string;
  }

  // Optional cloud fallback
  const fallback = await clack.select({
    message: "Also add a cloud provider for complex tasks? (optional)",
    options: [
      { value: "skip", label: "Skip for now" },
      { value: "anthropic", label: "Anthropic (Claude)", hint: "recommended" },
      { value: "openai", label: "OpenAI (GPT-4o)" },
    ],
  });
  if (clack.isCancel(fallback)) return null;

  const additionalProviders: SetupResult["additionalProviders"] = [];
  const chain = ["ollama"];

  if (fallback !== "skip") {
    const apiKey = await promptApiKey(fallback as string);
    if (apiKey === null) return null;
    if (apiKey) {
      additionalProviders.push({ provider: fallback as string, apiKey });
      chain.push(fallback as string);
    }
  }

  clack.outro("Ready! Entering chat...");
  return {
    provider: "ollama",
    model,
    providerChain: chain,
    additionalProviders,
  };
}

// ─── Scenario C: Full wizard ────────────────────────────────────────────────

async function scenarioFullWizard(env: DetectedEnvironment): Promise<SetupResult | null> {
  // Step 1: Select provider
  const provider = await clack.select({
    message: "Which AI provider will power your team?",
    options: PROVIDER_OPTIONS,
  });
  if (clack.isCancel(provider)) return cancelled();
  const providerStr = provider as string;

  // Step 2: API key (skip for local providers)
  let apiKey: string | undefined;
  const isLocal = providerStr === "ollama" || providerStr === "lmstudio";

  if (!isLocal) {
    const key = await promptApiKey(providerStr);
    if (key === null) return cancelled();
    apiKey = key || undefined;
  }

  // Step 3: Model selection
  const ollamaModels = providerStr === "ollama" ? (env.ollama?.models ?? []) : null;
  const lmStudioModels = providerStr === "lmstudio" ? (env.lmStudio?.models ?? []) : null;
  const localModels = ollamaModels ?? lmStudioModels;

  let model: string;
  if (localModels && localModels.length > 0) {
    const selected = await clack.select({
      message: "Which model?",
      options: localModels.map((m) => ({ value: m, label: m })),
    });
    if (clack.isCancel(selected)) return cancelled();
    model = selected as string;
  } else {
    const result = await selectModel(providerStr, apiKey ?? null);
    if (result === null) return cancelled();
    model = result;
  }

  // Step 4: Optional fallback
  const fallbackOptions = PROVIDER_OPTIONS
    .filter((p) => p.value !== providerStr)
    .slice(0, 3);

  const fallback = await clack.select({
    message: "Add a fallback provider? (optional)",
    options: [
      { value: "skip", label: "Skip for now" },
      ...fallbackOptions,
    ],
  });
  if (clack.isCancel(fallback)) return cancelled();

  const additionalProviders: SetupResult["additionalProviders"] = [];
  const chain = [providerStr];

  if (fallback !== "skip") {
    const fbProvider = fallback as string;
    const fbIsLocal = fbProvider === "ollama" || fbProvider === "lmstudio";
    if (!fbIsLocal) {
      const fbKey = await promptApiKey(fbProvider);
      if (fbKey !== null && fbKey) {
        additionalProviders.push({ provider: fbProvider, apiKey: fbKey });
        chain.push(fbProvider);
      }
    } else {
      additionalProviders.push({ provider: fbProvider });
      chain.push(fbProvider);
    }
  }

  clack.outro("Ready! Entering chat...");
  return {
    provider: providerStr,
    apiKey,
    model,
    providerChain: chain,
    additionalProviders,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function selectModel(provider: string, apiKey: string | null): Promise<string | null> {
  // Try live fetch first
  let liveModels: string[] | null = null;
  if (apiKey) {
    const s = clack.spinner();
    s.start("Fetching available models...");
    try {
      const { fetchOpenAICompatibleModels } = await import("../providers/model-fetcher.js");
      const baseUrl = getBaseUrl(provider);
      if (baseUrl) {
        const result = await fetchOpenAICompatibleModels(baseUrl, apiKey, { timeout: 5000 });
        if (result.models.length > 0) {
          liveModels = result.models.slice(0, 10).map((m) => m.id);
        }
      }
    } catch {
      // Fallback to hardcoded
    }
    s.stop(liveModels ? `Found ${liveModels.length} models` : "Using default model list");
  }

  // Use live models or hardcoded fallback
  const options = liveModels
    ? liveModels.map((m) => ({ value: m, label: m }))
    : (MODELS[provider] ?? [{ value: "default", label: "Default model" }]);

  const selected = await clack.select({
    message: "Which model?",
    options,
  });
  if (clack.isCancel(selected)) return null;
  return selected as string;
}

async function promptApiKey(provider: string): Promise<string | null> {
  const envVar = ENV_VAR_FOR_PROVIDER[provider];
  const hint = KEY_URL_HINTS[provider];
  const envValue = envVar ? process.env[envVar] : undefined;

  if (envValue) {
    clack.log.success(`Found ${envVar} in environment`);
    return envValue;
  }

  const message = hint
    ? `API key for ${provider} (from ${hint}):`
    : `API key for ${provider}:`;

  const key = await clack.text({
    message,
    placeholder: "sk-...",
    validate: (v) => {
      if (!v.trim()) return "API key is required";
      if (v.trim().length < 10) return "Key seems too short";
      return undefined;
    },
  });
  if (clack.isCancel(key)) return null;

  // Validate key with a quick API call
  const s = clack.spinner();
  s.start("Checking API key...");
  const valid = await validateApiKey(provider, key as string);
  if (valid) {
    s.stop("API key valid");
  } else {
    s.stop("Could not verify key (will try anyway)");
  }

  return key as string;
}

async function validateApiKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    const baseUrl = getBaseUrl(provider);
    if (!baseUrl) return true; // Can't validate, assume ok

    const { fetchOpenAICompatibleModels } = await import("../providers/model-fetcher.js");
    const result = await fetchOpenAICompatibleModels(baseUrl, apiKey, { timeout: 5000 });
    return result.models.length > 0 || !result.error;
  } catch {
    return false;
  }
}

function getBaseUrl(provider: string): string | null {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    grok: "https://api.x.ai/v1",
    mistral: "https://api.mistral.ai/v1",
    together: "https://api.together.xyz/v1",
    fireworks: "https://api.fireworks.ai/inference/v1",
  };
  return urls[provider] ?? null;
}

function cancelled(): null {
  clack.outro("Setup cancelled.");
  return null;
}
