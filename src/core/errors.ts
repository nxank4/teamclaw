import pc from 'picocolors';
import type { ProviderErrorType } from './result-types.js';

export const PROVIDER_URLS: Record<string, { keyUrl: string | null; statusUrl: string }> = {
  anthropic:  { keyUrl: 'https://console.anthropic.com/settings/keys', statusUrl: 'https://status.anthropic.com' },
  openai:     { keyUrl: 'https://platform.openai.com/api-keys', statusUrl: 'https://status.openai.com' },
  openrouter: { keyUrl: 'https://openrouter.ai/settings/keys', statusUrl: 'https://openrouter.ai' },
  deepseek:   { keyUrl: 'https://platform.deepseek.com/api_keys', statusUrl: 'https://platform.deepseek.com' },
  groq:       { keyUrl: 'https://console.groq.com/keys', statusUrl: 'https://console.groq.com' },
  ollama:     { keyUrl: null, statusUrl: 'http://localhost:11434' },
  custom:     { keyUrl: null, statusUrl: '' },
  gemini:     { keyUrl: 'https://aistudio.google.com/app/apikey', statusUrl: 'https://status.cloud.google.com' },
  grok:       { keyUrl: 'https://console.x.ai', statusUrl: 'https://status.x.ai' },
  mistral:    { keyUrl: 'https://console.mistral.ai/api-keys', statusUrl: 'https://console.mistral.ai' },
  cerebras:   { keyUrl: 'https://inference.cerebras.ai', statusUrl: 'https://inference.cerebras.ai' },
  together:   { keyUrl: 'https://api.together.ai', statusUrl: 'https://api.together.ai' },
  fireworks:  { keyUrl: 'https://fireworks.ai/api-keys', statusUrl: 'https://fireworks.ai' },
  perplexity: { keyUrl: 'https://www.perplexity.ai/settings/api', statusUrl: 'https://www.perplexity.ai' },
  moonshot:   { keyUrl: 'https://platform.moonshot.cn/console/api-keys', statusUrl: 'https://platform.moonshot.cn' },
  zai:        { keyUrl: 'https://open.bigmodel.cn', statusUrl: 'https://open.bigmodel.cn' },
  minimax:    { keyUrl: 'https://api.minimax.io', statusUrl: 'https://api.minimax.io' },
  cohere:     { keyUrl: 'https://dashboard.cohere.com/api-keys', statusUrl: 'https://dashboard.cohere.com' },
  'opencode-zen': { keyUrl: 'https://opencode.ai/auth', statusUrl: 'https://opencode.ai' },
  'opencode-go':  { keyUrl: 'https://opencode.ai/auth', statusUrl: 'https://opencode.ai' },
  bedrock:    { keyUrl: null, statusUrl: 'https://health.aws.amazon.com' },
  vertex:     { keyUrl: null, statusUrl: 'https://status.cloud.google.com' },
  azure:      { keyUrl: null, statusUrl: 'https://status.azure.com' },
  lmstudio:   { keyUrl: null, statusUrl: 'http://localhost:1234' },
  chatgpt:    { keyUrl: null, statusUrl: 'https://status.openai.com' },
  copilot:    { keyUrl: null, statusUrl: 'https://www.githubstatus.com' },
};

export const API_KEY_PREFIXES: Record<string, string | null> = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  openrouter: 'sk-or-',
  deepseek: 'sk-',
  groq: 'gsk_',
  ollama: null,
  custom: null,
  gemini: null,
  grok: 'xai-',
  mistral: null,
  cerebras: null,
  together: null,
  fireworks: null,
  perplexity: null,
  moonshot: 'sk-',
  zai: null,
  minimax: null,
  cohere: null,
  'opencode-zen': 'sk-opencode-',
  'opencode-go': 'sk-opencode-go-',
  bedrock: null,
  vertex: null,
  azure: null,
  lmstudio: null,
  chatgpt: null,
  copilot: null,
};

export function validateApiKeyFormat(
  provider: string,
  key: string,
): { valid: boolean; hint: string } {
  const prefix = API_KEY_PREFIXES[provider] ?? null;

  if (prefix === null) {
    return { valid: true, hint: '' };
  }

  if (key.startsWith(prefix)) {
    return { valid: true, hint: '' };
  }

  return {
    valid: false,
    hint: `Expected key to start with "${prefix}" for ${provider}`,
  };
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return `${key}...****`;
  }
  return `${key.slice(0, 8)}...****`;
}

export const ERROR_MESSAGES: Record<string, { title: string; body: string; fix: string[] }> = {
  CONNECTION_FAILED: {
    title: 'Could not connect to {provider}',
    body: 'The {provider} service may be down or your internet connection may have an issue.',
    fix: [
      'Check your internet connection',
      'Check {provider} status at {statusUrl}',
      'Try again in a few minutes',
    ],
  },
  AUTHENTICATION_FAILED: {
    title: 'Invalid API key for {provider}',
    body: 'Your API key was rejected. It may be expired or incorrect.',
    fix: [
      'Get a new key at: {keyUrl}',
      'Update your key: teamclaw config set providers.{provider}.apiKey YOUR_KEY',
      'Test the connection: teamclaw check',
    ],
  },
  RATE_LIMITED: {
    title: 'Rate limit reached for {provider}',
    body: 'You have sent too many requests. {provider} is asking us to slow down.',
    fix: [
      'Wait 60 seconds and try again',
      'Consider adding a fallback provider: teamclaw providers add',
      'Upgrade your {provider} plan for higher limits',
    ],
  },
  FIRST_CHUNK_TIMEOUT: {
    title: '{provider} is not responding',
    body: 'TeamClaw waited 15 seconds for a response but got nothing.',
    fix: [
      'Check your internet connection',
      'Try again — this is sometimes temporary',
      'Add a faster fallback provider',
    ],
  },
  ALL_PROVIDERS_FAILED: {
    title: 'All providers failed',
    body: 'TeamClaw tried all your configured providers and none responded.',
    fix: [
      'Run teamclaw check to see provider status',
      'Verify at least one API key is valid',
      'Check your internet connection',
    ],
  },
  NO_PROVIDERS_CONFIGURED: {
    title: 'No AI provider configured',
    body: 'TeamClaw needs an API key to work.',
    fix: [
      'Run teamclaw setup to configure a provider',
      'Or set: ANTHROPIC_API_KEY=sk-ant-... teamclaw work',
    ],
  },
  STREAM_FAILED: {
    title: 'Lost connection to {provider}',
    body: 'The response stream was interrupted before completing.',
    fix: [
      'Try again — this is usually temporary',
      'Check your internet connection',
      'If persistent, check {provider} status at {statusUrl}',
    ],
  },
  PROVIDER_ERROR: {
    title: '{provider} returned an error',
    body: 'The provider could not process the request.',
    fix: [
      'Try again in a moment',
      'Check {provider} status at {statusUrl}',
      'Run teamclaw check to verify your setup',
    ],
  },
  CHATGPT_OAUTH_REQUIRED: {
    title: 'ChatGPT OAuth not configured',
    body: 'Run the setup flow to connect your ChatGPT subscription.',
    fix: ['Run: teamclaw providers add chatgpt'],
  },
  CHATGPT_TOKEN_EXPIRED: {
    title: 'ChatGPT token expired',
    body: 'Your ChatGPT OAuth token has expired. Refreshing automatically...',
    fix: ['If this persists, re-run: teamclaw providers add chatgpt'],
  },
  COPILOT_GITHUB_NOT_FOUND: {
    title: 'GitHub token not found',
    body: 'Could not find a GitHub token for Copilot access.',
    fix: ['Run: gh auth login', 'Or let TeamClaw run the device flow: teamclaw providers add copilot'],
  },
  COPILOT_TOKEN_EXPIRED: {
    title: 'Copilot token expired',
    body: 'Your Copilot access token has expired. Refreshing automatically...',
    fix: ['If this persists, re-run: teamclaw providers add copilot'],
  },
  CLAUDE_SETUP_TOKEN_REJECTED: {
    title: 'Anthropic rejected the setup-token',
    body: 'The setup-token from Claude CLI was not accepted.',
    fix: ['Re-run: claude setup-token', 'If persistent, switch to API key: teamclaw providers add anthropic'],
  },
  GEMINI_OAUTH_BANNED: {
    title: 'Google account may be suspended',
    body: 'Google may have banned your account for Antigravity ToS violation (403).',
    fix: ['Switch to API key: https://aistudio.google.com/app/apikey'],
  },
  LOCAL_NOT_RUNNING: {
    title: '{provider} not running',
    body: '{provider} is not responding at the expected address.',
    fix: ['For Ollama: run "ollama serve"', 'For LM Studio: open app → Local Server → Start Server'],
  },
  BEDROCK_INVALID_CREDS: {
    title: 'AWS credentials invalid',
    body: 'Your AWS credentials were rejected by Bedrock.',
    fix: ['Check IAM permissions: bedrock:InvokeModel', 'Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY'],
  },
  TOGETHER_QUOTA_EXHAUSTED: {
    title: 'Together AI quota exhausted',
    body: 'Your Together AI usage quota has been reached.',
    fix: ['Add credits at api.together.ai', 'Add a fallback provider to your chain'],
  },
  ANTHROPIC_OAUTH_BLOCKED: {
    title: 'Anthropic OAuth not supported',
    body: 'Anthropic OAuth tokens (from claude.ai) are not supported for third-party tools.',
    fix: ['Use an API key: teamclaw providers add anthropic', 'Or setup-token (gray area): teamclaw providers add anthropic-sub'],
  },
  SANDBOX_TIMEOUT: {
    title: 'Code execution timed out',
    body: 'Code execution timed out (>15s, exit 124). Optimize the code or break into smaller functions.',
    fix: ['Break code into smaller chunks', 'Avoid infinite loops or expensive operations', 'Consider streaming results instead of batch processing'],
  },
  SANDBOX_MEMORY_EXCEEDED: {
    title: 'Sandbox memory limit exceeded',
    body: 'Code execution exceeded memory limit (128MB). Process data in chunks or reduce memory usage.',
    fix: ['Process data in smaller batches', 'Avoid loading entire files into memory', 'Stream large datasets instead of buffering'],
  },
  SANDBOX_PERMISSION_DENIED: {
    title: 'Sandbox permission denied',
    body: 'Sandbox blocked access to: {resource}. Agents can only access the current project workspace.',
    fix: ['Ensure file paths are within the project workspace', 'Network access is not available inside the sandbox', 'Environment variables are restricted to PATH, HOME, NODE_PATH, NODE_ENV, TMPDIR'],
  },
  SANDBOX_PAYLOAD_TOO_LARGE: {
    title: 'Sandbox payload too large',
    body: 'Data transfer to/from sandbox exceeded size limit. Write large data to disk instead of returning it directly.',
    fix: ['Write results to a file in the workspace', 'Return only a summary or reference, not the full data', 'Limit base64 payloads to 10MB and JSON to 5MB'],
  },
  SANDBOX_INIT_FAILED: {
    title: 'Sandbox initialization failed',
    body: 'Failed to initialize code execution sandbox. Requires Node.js >= 20.',
    fix: ['Run: teamclaw check', 'Ensure Node.js >= 20 is installed', 'Run: pnpm install (secure-exec may need rebuilding)'],
  },
  CUSTOM_AGENT_SANDBOX_FAILED: {
    title: 'Custom agent sandbox failure',
    body: 'Custom agent "{name}" failed in sandbox (exit {code}). Handlers cannot access network, processes, or env vars.',
    fix: ['Ensure handler is self-contained with no external closures', 'Check handler logic for runtime errors', 'Run: teamclaw check to verify sandbox health'],
  },
};

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

export function formatError(code: string, provider: string, technicalDetail?: string): string {
  const template = ERROR_MESSAGES[code] ?? ERROR_MESSAGES['PROVIDER_ERROR'];
  const urls = PROVIDER_URLS[provider] ?? PROVIDER_URLS['custom'];

  const vars: Record<string, string> = {
    provider,
    keyUrl: urls.keyUrl ?? 'N/A',
    statusUrl: urls.statusUrl,
  };

  const title = replacePlaceholders(template.title, vars);
  const body = replacePlaceholders(template.body, vars);
  const fixes = template.fix.map((f) => replacePlaceholders(f, vars));

  const lines: string[] = [
    `${pc.red('✗')} ${pc.red(title)}`,
    '',
    body,
    '',
    'How to fix:',
    ...fixes.map((f, i) => `  ${i + 1}. ${f}`),
  ];

  if (technicalDetail) {
    lines.push('', `Technical detail: ${pc.dim(technicalDetail)}`);
  }

  return lines.join('\n');
}

export function formatFirstRunMessage(): string {
  const lines: string[] = [
    `${pc.red('✗')} TeamClaw is not configured yet.`,
    '',
    'Run setup first:',
    '  teamclaw setup',
    '',
    'Or quick start with just an API key:',
    '  export ANTHROPIC_API_KEY=sk-ant-...',
    '  teamclaw work --goal "your goal"',
  ];

  return lines.join('\n');
}

export function formatProviderErrorType(error: ProviderErrorType): string {
  switch (error.type) {
    case "rate_limit":
      return `Rate limit hit on ${error.provider}. ` +
        (error.retryAfterMs
          ? `Retry in ${Math.ceil(error.retryAfterMs / 1000)}s.`
          : "TeamClaw will try the next provider in your chain.");
    case "timeout":
      return `${error.provider} timed out after ${error.timeoutMs}ms. ` +
        "Try a faster model or check your connection.";
    case "auth_failed":
      return `Authentication failed for ${error.provider}. ` +
        "Run: teamclaw providers add " + error.provider;
    case "model_not_found":
      return `Model "${error.model}" not found on ${error.provider}. ` +
        "Run: teamclaw providers list to see available models.";
    case "context_too_long":
      return `Context too long for ${error.provider}. ` +
        "Enable context compression or use a model with larger context window.";
    case "invalid_response":
      return `Invalid response from ${error.provider}. Raw: ${error.raw.slice(0, 100)}`;
    case "network":
      return `Network error from ${error.provider}: ${error.message}`;
    case "unknown":
      return `Unexpected error from ${error.provider}: ${String(error.cause)}`;
  }
}
