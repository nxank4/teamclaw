export type AuthMethod = "apikey" | "oauth" | "device-oauth" | "setup-token" | "local" | "credentials";
export type ProviderCategory = "subscription" | "apikey" | "opencode" | "cloud" | "local";

export interface ProviderModel {
  id: string;
  label: string;
  hint?: string;
}

export interface ProviderMeta {
  name: string;
  authMethod: AuthMethod;
  category: ProviderCategory;
  envKeys: string[];
  keyPrefix?: string;
  keyUrl?: string;
  statusUrl?: string;
  baseURL?: string;
  models: ProviderModel[];
  menuLabel: string;
  menuHint?: string;
  notes?: string[];
  warning?: string;
  openaiCompatible: boolean;
}

function m(id: string, label?: string, hint?: string): ProviderModel {
  return { id, label: label ?? id, ...(hint ? { hint } : {}) };
}

export const PROVIDER_CATALOG: Record<string, ProviderMeta> = {
  // ── Subscription ──────────────────────────────────────────────────────
  chatgpt: {
    name: "ChatGPT Plus/Pro",
    authMethod: "oauth",
    category: "subscription",
    envKeys: [],
    baseURL: "https://api.openai.com/v1",
    models: [m("gpt-5.3-codex"), m("gpt-5-mini"), m("gpt-4o"), m("o3")],
    menuLabel: "ChatGPT Plus/Pro \u2014 OAuth [officially supported by OpenAI]",
    openaiCompatible: false,
  },
  copilot: {
    name: "GitHub Copilot",
    authMethod: "device-oauth",
    category: "subscription",
    envKeys: ["GITHUB_TOKEN"],
    baseURL: "https://api.githubcopilot.com/chat/completions",
    models: [
      m("claude-opus-4.6"), m("claude-sonnet-4.6"), m("gpt-4o"),
      m("gpt-5-mini"), m("gemini-2.5-pro"), m("o3"),
    ],
    menuLabel: "GitHub Copilot ($10-19/mo) \u2014 Device OAuth [officially supported]",
    openaiCompatible: false,
  },
  "anthropic-sub": {
    name: "Claude Pro/Max",
    authMethod: "setup-token",
    category: "subscription",
    envKeys: [],
    models: [m("claude-opus-4-6"), m("claude-sonnet-4-6"), m("claude-haiku-4-5")],
    menuLabel: "Claude Pro/Max \u2014 setup-token [ToS gray area]",
    menuHint: "\u26a0\ufe0f",
    warning:
      "\u26a0\ufe0f  IMPORTANT: Anthropic's Terms of Service state that OAuth tokens from\n" +
      "    Claude Pro/Max plans are intended for Claude Code and claude.ai only.\n" +
      "    TeamClaw supports this as a technical compatibility option. Anthropic has\n" +
      "    enforced this in the past. Use at your own discretion. For a guaranteed\n" +
      "    safe path, use an Anthropic API key instead.",
    openaiCompatible: false,
  },
  "gemini-oauth": {
    name: "Google Gemini (subscription)",
    authMethod: "oauth",
    category: "subscription",
    envKeys: [],
    models: [m("gemini-3-pro"), m("gemini-3-flash")],
    menuLabel: "Google Gemini Pro/Ultra \u2014 OAuth [account ban risk]",
    menuHint: "\u26a0\ufe0f",
    warning:
      "\u26a0\ufe0f  WARNING: Google has issued account bans (403 ToS violations) for\n" +
      "    using Gemini subscription OAuth via third-party tools since February 2026.\n" +
      "    Google Antigravity ToS explicitly prohibits third-party access.\n" +
      "    A Gemini API key is strongly recommended instead.",
    openaiCompatible: false,
  },

  // ── API Key ───────────────────────────────────────────────────────────
  anthropic: {
    name: "Anthropic (Claude)",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["ANTHROPIC_API_KEY"],
    keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
    statusUrl: "https://status.anthropic.com",
    models: [
      m("claude-opus-4-6", "claude-opus-4-6", "Best reasoning"),
      m("claude-sonnet-4-6", "claude-sonnet-4-6", "Fast + capable, recommended"),
      m("claude-haiku-4-5", "claude-haiku-4-5", "Fastest, cheapest"),
    ],
    menuLabel: "Anthropic (Claude) \u2014 API key [recommended]",
    openaiCompatible: false,
  },
  openai: {
    name: "OpenAI (GPT)",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["OPENAI_API_KEY"],
    keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
    statusUrl: "https://status.openai.com",
    baseURL: "https://api.openai.com/v1",
    models: [m("gpt-5.3-codex"), m("gpt-4o"), m("gpt-5-mini"), m("o3"), m("o4-mini")],
    menuLabel: "OpenAI (GPT) \u2014 API key",
    openaiCompatible: true,
  },
  gemini: {
    name: "Google Gemini",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
    keyUrl: "https://aistudio.google.com/app/apikey",
    statusUrl: "https://status.cloud.google.com",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: [m("gemini-3-pro"), m("gemini-3-flash"), m("gemini-2.5-pro"), m("gemini-2.5-flash")],
    menuLabel: "Google Gemini \u2014 API key",
    notes: ["Free tier available with rate limits"],
    openaiCompatible: true,
  },
  grok: {
    name: "xAI Grok",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["XAI_API_KEY"],
    keyPrefix: "xai-",
    keyUrl: "https://console.x.ai",
    statusUrl: "https://status.x.ai",
    baseURL: "https://api.x.ai/v1",
    models: [
      m("grok-4", "grok-4", "Most capable, 2M context"),
      m("grok-4-fast"), m("grok-3"), m("grok-3-mini"),
    ],
    menuLabel: "xAI Grok \u2014 API key",
    openaiCompatible: true,
  },
  mistral: {
    name: "Mistral AI",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["MISTRAL_API_KEY"],
    keyUrl: "https://console.mistral.ai/api-keys",
    statusUrl: "https://console.mistral.ai",
    baseURL: "https://api.mistral.ai/v1",
    models: [
      m("mistral-large-3"), m("mistral-medium-3"), m("codestral"),
      m("mistral-small"), m("pixtral-large"),
    ],
    menuLabel: "Mistral AI \u2014 API key",
    notes: ["Free Experiment plan: 2 req/min, 1B tokens/month", "EU data residency"],
    openaiCompatible: true,
  },
  deepseek: {
    name: "DeepSeek",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["DEEPSEEK_API_KEY"],
    keyPrefix: "sk-",
    keyUrl: "https://platform.deepseek.com/api_keys",
    statusUrl: "https://platform.deepseek.com",
    baseURL: "https://api.deepseek.com/v1",
    models: [m("deepseek-v3-2"), m("deepseek-r1"), m("deepseek-coder-v3")],
    menuLabel: "DeepSeek \u2014 API key",
    openaiCompatible: true,
  },
  groq: {
    name: "Groq",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["GROQ_API_KEY"],
    keyPrefix: "gsk_",
    keyUrl: "https://console.groq.com/keys",
    statusUrl: "https://console.groq.com",
    baseURL: "https://api.groq.com/openai/v1",
    models: [
      m("kimi-k2.5"), m("llama-3.3-70b"), m("llama-3.1-70b"),
      m("mixtral-8x7b"), m("gemma2-9b"),
    ],
    menuLabel: "Groq \u2014 API key",
    notes: ["1000+ tok/s LPU hardware", "Free tier generous"],
    openaiCompatible: true,
  },
  cerebras: {
    name: "Cerebras",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["CEREBRAS_API_KEY"],
    keyUrl: "https://inference.cerebras.ai",
    statusUrl: "https://inference.cerebras.ai",
    baseURL: "https://api.cerebras.ai/v1",
    models: [m("qwen3-coder-480b"), m("llama-3.3-70b"), m("llama-3.1-70b")],
    menuLabel: "Cerebras \u2014 API key",
    openaiCompatible: true,
  },
  together: {
    name: "Together AI",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["TOGETHER_API_KEY", "TOGETHER_AI_API_KEY"],
    keyUrl: "https://api.together.ai",
    statusUrl: "https://api.together.ai",
    baseURL: "https://api.together.ai/v1",
    models: [
      m("kimi-k2.5-instruct"), m("deepseek-v3-2"), m("qwen3-235b-a22b"),
      m("llama-4-maverick"), m("mistral-large-3"), m("glm-5"), m("minimax-m2.5"),
    ],
    menuLabel: "Together AI \u2014 API key",
    notes: ["100+ open models", "Up to $100 free credit"],
    openaiCompatible: true,
  },
  fireworks: {
    name: "Fireworks AI",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["FIREWORKS_API_KEY"],
    keyUrl: "https://fireworks.ai/api-keys",
    statusUrl: "https://fireworks.ai",
    baseURL: "https://api.fireworks.ai/inference/v1",
    models: [
      m("accounts/fireworks/models/deepseek-v3-2"),
      m("accounts/fireworks/models/qwen3-235b-a22b"),
      m("accounts/fireworks/models/llama-4-maverick"),
      m("accounts/fireworks/models/mixtral-8x7b"),
    ],
    menuLabel: "Fireworks AI \u2014 API key",
    openaiCompatible: true,
  },
  openrouter: {
    name: "OpenRouter",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["OPENROUTER_API_KEY"],
    keyPrefix: "sk-or-",
    keyUrl: "https://openrouter.ai/settings/keys",
    statusUrl: "https://openrouter.ai",
    baseURL: "https://openrouter.ai/api/v1",
    models: [
      m("anthropic/claude-opus-4-6"), m("openai/gpt-5.3-codex"),
      m("google/gemini-3-pro"), m("x-ai/grok-4"),
      m("deepseek/deepseek-v3-2"), m("qwen/qwen3-235b"),
      m("meta-llama/llama-4-maverick"), m("mistralai/mistral-large-3"),
      m("moonshot/kimi-k2.5"), m("zhipuai/glm-5"), m("minimax/minimax-m2.5"),
    ],
    menuLabel: "OpenRouter \u2014 API key",
    notes: ["Gateway to 200+ models", "Shows cost per model"],
    openaiCompatible: true,
  },
  perplexity: {
    name: "Perplexity",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["PERPLEXITY_API_KEY"],
    keyUrl: "https://www.perplexity.ai/settings/api",
    statusUrl: "https://www.perplexity.ai",
    baseURL: "https://api.perplexity.ai",
    models: [m("sonar-pro"), m("sonar"), m("sonar-reasoning")],
    menuLabel: "Perplexity \u2014 API key",
    notes: ["All models grounded in real-time web search"],
    openaiCompatible: true,
  },
  moonshot: {
    name: "Moonshot AI (Kimi)",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["MOONSHOT_API_KEY"],
    keyPrefix: "sk-",
    keyUrl: "https://platform.moonshot.cn/console/api-keys",
    statusUrl: "https://platform.moonshot.cn",
    baseURL: "https://api.moonshot.cn/v1",
    models: [m("kimi-k2.5-instruct"), m("kimi-k2-instruct"), m("moonshot-v1-128k")],
    menuLabel: "Moonshot AI (Kimi) \u2014 API key",
    notes: ["Also accessible via Together AI / Groq / OpenRouter"],
    openaiCompatible: true,
  },
  zai: {
    name: "Z.AI (GLM / Zhipu AI)",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["ZAI_API_KEY", "ZHIPU_API_KEY"],
    keyUrl: "https://open.bigmodel.cn",
    statusUrl: "https://open.bigmodel.cn",
    baseURL: "https://api.z.ai/api/paas/v4",
    models: [m("glm-5"), m("glm-4.7"), m("glm-4.7-flash")],
    menuLabel: "Z.AI (GLM / Zhipu AI) \u2014 API key",
    notes: ["GLM-5 comparable to Claude Sonnet 4.5", "GLM-4.7 open MIT license"],
    openaiCompatible: true,
  },
  minimax: {
    name: "MiniMax",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["MINIMAX_API_KEY"],
    keyUrl: "https://api.minimax.io",
    statusUrl: "https://api.minimax.io",
    baseURL: "https://api.minimax.io/v1",
    models: [
      m("minimax-m2.5", "minimax-m2.5", "1M context, multimodal, MIT"),
      m("minimax-m2.1"),
    ],
    menuLabel: "MiniMax \u2014 API key",
    notes: ["1M context window", "Strong multilingual coding"],
    openaiCompatible: true,
  },
  cohere: {
    name: "Cohere",
    authMethod: "apikey",
    category: "apikey",
    envKeys: ["COHERE_API_KEY"],
    keyUrl: "https://dashboard.cohere.com/api-keys",
    statusUrl: "https://dashboard.cohere.com",
    baseURL: "https://api.cohere.com/v2",
    models: [m("command-r-plus-08-2024"), m("command-r-08-2024"), m("command-a-03-2025")],
    menuLabel: "Cohere \u2014 API key",
    notes: ["Best-in-class for RAG", "Free tier available"],
    openaiCompatible: true,
  },

  // ── OpenCode ──────────────────────────────────────────────────────────
  "opencode-zen": {
    name: "OpenCode Zen",
    authMethod: "apikey",
    category: "opencode",
    envKeys: ["OPENCODE_API_KEY"],
    keyUrl: "https://opencode.ai/auth",
    statusUrl: "https://opencode.ai",
    baseURL: "https://api.opencode.ai/v1",
    models: [m("claude-sonnet-4-6"), m("gpt-5.3-codex"), m("gemini-3-pro")],
    menuLabel: "OpenCode Zen \u2014 API key",
    openaiCompatible: true,
  },
  "opencode-go": {
    name: "OpenCode Go",
    authMethod: "apikey",
    category: "opencode",
    envKeys: ["OPENCODE_GO_API_KEY"],
    keyUrl: "https://opencode.ai/auth",
    statusUrl: "https://opencode.ai",
    baseURL: "https://api.opencode.ai/v1",
    models: [m("glm-5"), m("kimi-k2.5"), m("minimax-m2.5")],
    menuLabel: "OpenCode Go \u2014 curated open models ($10/mo)",
    openaiCompatible: true,
  },

  // ── Cloud/Enterprise ──────────────────────────────────────────────────
  bedrock: {
    name: "AWS Bedrock",
    authMethod: "credentials",
    category: "cloud",
    envKeys: ["AWS_ACCESS_KEY_ID"],
    models: [
      m("anthropic.claude-opus-4-6-v1:0"), m("anthropic.claude-sonnet-4-6-v1:0"),
      m("anthropic.claude-haiku-4-5"), m("meta.llama4-maverick-17b-instruct"),
    ],
    menuLabel: "AWS Bedrock \u2014 IAM credentials",
    openaiCompatible: false,
  },
  vertex: {
    name: "Google Vertex AI",
    authMethod: "credentials",
    category: "cloud",
    envKeys: ["GOOGLE_APPLICATION_CREDENTIALS"],
    models: [
      m("claude-opus-4-6@anthropic"), m("claude-sonnet-4-6@anthropic"),
      m("gemini-3-pro"), m("gemini-3-flash"),
    ],
    menuLabel: "Google Vertex AI \u2014 service account credentials",
    openaiCompatible: false,
  },
  azure: {
    name: "Azure OpenAI",
    authMethod: "apikey",
    category: "cloud",
    envKeys: ["AZURE_OPENAI_API_KEY"],
    models: [m("gpt-4o")],
    menuLabel: "Azure OpenAI \u2014 API key",
    notes: ["Content filter DefaultV2 can cause refusals"],
    openaiCompatible: true,
  },

  // ── Local ─────────────────────────────────────────────────────────────
  ollama: {
    name: "Ollama",
    authMethod: "local",
    category: "local",
    envKeys: [],
    baseURL: "http://localhost:11434/v1",
    models: [
      m("glm-4.7-flash"), m("qwen3-coder"), m("deepseek-v3:8b"),
      m("llama3:70b"), m("mistral"), m("codellama"),
    ],
    menuLabel: "Ollama \u2014 local",
    openaiCompatible: true,
  },
  lmstudio: {
    name: "LM Studio",
    authMethod: "local",
    category: "local",
    envKeys: [],
    baseURL: "http://localhost:1234/v1",
    models: [],
    menuLabel: "LM Studio \u2014 local",
    openaiCompatible: true,
  },
  custom: {
    name: "Custom endpoint",
    authMethod: "apikey",
    category: "local",
    envKeys: [],
    models: [],
    menuLabel: "Custom endpoint",
    openaiCompatible: true,
  },
};

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_CATALOG[id];
}

export function getAllProviderIds(): string[] {
  return Object.keys(PROVIDER_CATALOG);
}

export function getProvidersByCategory(category: ProviderCategory): Array<[string, ProviderMeta]> {
  return Object.entries(PROVIDER_CATALOG).filter(([, meta]) => meta.category === category);
}
