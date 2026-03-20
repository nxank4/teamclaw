/**
 * Setup Step 1: Provider configuration — select providers, API keys, fallback chain.
 */

import {
    confirm,
    isCancel,
    cancel,
    select,
    spinner,
    text,
    password,
} from "@clack/prompts";
import pc from "picocolors";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProviderConfigEntry } from "../../core/global-config.js";
import { randomPhrase } from "../../utils/spinner-phrases.js";
import { PROVIDER_CATALOG } from "../../providers/provider-catalog.js";
import { searchableSelect } from "../../utils/searchable-select.js";

/** Try to find an existing Claude OAuth token from Claude Code or OpenClaw. */
function detectClaudeOAuthToken(): string | null {
    // 1. Environment variable (highest priority)
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const home = homedir();

    // 2. Claude Code credentials (~/.claude/.credentials.json)
    try {
        const raw = readFileSync(join(home, ".claude", ".credentials.json"), "utf-8");
        const data = JSON.parse(raw);
        const token = data?.claudeAiOauth?.accessToken;
        if (typeof token === "string" && token.length > 0) return token;
    } catch { /* not found */ }

    // 3. OpenClaw credentials (~/.openclaw/credentials/anthropic.token.json)
    try {
        const raw = readFileSync(join(home, ".openclaw", "credentials", "anthropic.token.json"), "utf-8");
        const data = JSON.parse(raw);
        const token = data?.token ?? data?.accessToken;
        if (typeof token === "string" && token.length > 0) return token;
    } catch { /* not found */ }

    return null;
}

export interface WizardState {
    providerEntries: ProviderConfigEntry[];
    workspaceDir: string;
    projectName: string;
    selectedModel: string;
    goal: string;
    roster: import("../../core/team-templates.js").RosterEntry[];
    templateId: string;
    teamMode?: string;
    anthropicApiKey?: string;
}

export function handleCancel<T>(v: T): T {
    if (isCancel(v)) {
        cancel("Cancelled.");
        process.exit(0);
    }
    return v;
}

type ProviderType = ProviderConfigEntry["type"];

const PROVIDER_CHOICES: Array<{ value: string; label: string; hint?: string }> = [
    // Subscription plans (first — users already pay for these)
    { value: "chatgpt", label: "ChatGPT Plus/Pro", hint: "Use your ChatGPT Plus/Pro subscription" },
    { value: "copilot", label: "GitHub Copilot", hint: "Use your Copilot subscription — no API key needed" },
    // API keys
    { value: "anthropic", label: "Anthropic (Claude)", hint: "Recommended — built and tested with TeamClaw" },
    { value: "openai", label: "OpenAI (GPT)", hint: "Great quality" },
    { value: "gemini", label: "Google Gemini", hint: "API key or subscription (OAuth)" },
    { value: "grok", label: "xAI Grok", hint: "2M token context · live web search" },
    { value: "mistral", label: "Mistral AI", hint: "EU data residency" },
    { value: "deepseek", label: "DeepSeek", hint: "Best value — frontier quality at low cost" },
    { value: "groq", label: "Groq", hint: "Fastest inference" },
    { value: "cerebras", label: "Cerebras", hint: "Ultra-fast inference" },
    { value: "together", label: "Together AI", hint: "100+ open models, $100 free" },
    { value: "fireworks", label: "Fireworks AI", hint: "Fast open model serving" },
    { value: "openrouter", label: "OpenRouter", hint: "200+ models, one key" },
    { value: "perplexity", label: "Perplexity", hint: "Answers backed by live web search" },
    { value: "moonshot", label: "Moonshot AI (Kimi)", hint: "Kimi K2.5" },
    { value: "zai", label: "Z.AI (GLM / Zhipu)", hint: "GLM-5" },
    { value: "minimax", label: "MiniMax", hint: "1M context" },
    { value: "cohere", label: "Cohere", hint: "Best for document Q&A and search" },
    // OpenCode
    { value: "opencode", label: "OpenCode", hint: "Zen (frontier) + Go (open, $10/mo)" },
    // Cloud
    { value: "bedrock", label: "AWS Bedrock", hint: "IAM credentials" },
    { value: "vertex", label: "Google Vertex AI", hint: "Service account" },
    { value: "azure", label: "Azure OpenAI", hint: "API key + endpoint" },
    // Local
    { value: "ollama", label: "Ollama", hint: "Free \u00b7 Runs locally \u00b7 No key" },
    { value: "lmstudio", label: "LM Studio", hint: "Free \u00b7 Runs locally \u00b7 No key" },
    { value: "custom", label: "Custom", hint: "Any OpenAI-compatible API" },
];

/** Get default model for a provider from the catalog, with fallbacks for legacy types */
function getDefaultModel(providerType: string): string {
    const meta = PROVIDER_CATALOG[providerType];
    return meta?.models[0]?.id ?? "";
}

async function testOllamaConnection(baseURL: string): Promise<boolean> {
    const s = spinner();
    s.start(randomPhrase("gateway"));
    try {
        const url = baseURL.replace(/\/+$/, "") + "/api/tags";
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            s.stop(pc.green("Ollama is reachable!"));
            return true;
        }
        s.stop(pc.yellow(`Ollama responded with status ${res.status}`));
        return false;
    } catch {
        s.stop(pc.yellow(`Could not reach Ollama at ${baseURL}`));
        return false;
    }
}

async function testProviderConnection(entry: ProviderConfigEntry): Promise<boolean> {
    // Skip providers that are already tested or can't be meaningfully tested
    if (entry.type === "ollama" || entry.type === "lmstudio") return true;
    const meta = PROVIDER_CATALOG[entry.type];
    if (meta?.authMethod === "credentials" || meta?.authMethod === "local") return true;
    if (!entry.apiKey && !entry.setupToken) return true;

    const { providerFromConfig } = await import("../../providers/provider-factory.js");
    const provider = providerFromConfig(entry);
    if (!provider) return true;

    const s = spinner();
    s.start(randomPhrase("network"));
    try {
        const ok = await Promise.race([
            provider.healthCheck(),
            new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ]);
        if (ok) {
            s.stop(pc.green("Connection verified!"));
            return true;
        }
        s.stop(pc.yellow("Could not verify connection."));
        return false;
    } catch {
        s.stop(pc.yellow("Could not verify connection."));
        return false;
    }
}

async function promptProviderEntry(): Promise<ProviderConfigEntry> {
    const providerType = handleCancel(
        await searchableSelect({
            message: "Which AI provider will power your team?\n  " + pc.dim("New here? Anthropic (Claude) is what we recommend."),
            options: PROVIDER_CHOICES,
            maxItems: 12,
        }),
    ) as string;

    const entry: ProviderConfigEntry = { type: providerType as ProviderType };

    if (providerType === "ollama") {
        console.log([
            "",
            `  ${pc.bold("Ollama runs AI models locally on your machine.")}`,
            `  It's completely free — no API key needed.`,
            "",
            `  Requirements:`,
            `  \u00b7 Ollama installed: ${pc.cyan("https://ollama.ai/download")}`,
            `  \u00b7 At least one model pulled: ${pc.dim("ollama pull llama3.1")}`,
            "",
        ].join("\n"));

        const baseURL = handleCancel(
            await text({
                message: "Ollama base URL:",
                initialValue: "http://localhost:11434",
                placeholder: "http://localhost:11434",
                validate: (v) =>
                    (v ?? "").trim().length > 0 ? undefined : "URL cannot be empty",
            }),
        ) as string;
        entry.baseURL = baseURL.trim();

        const reachable = await testOllamaConnection(entry.baseURL);
        if (!reachable) {
            console.log([
                "",
                `  ${pc.yellow("\u26a0")} Ollama is not running at ${entry.baseURL}`,
                "",
                `  To install Ollama:`,
                `    1. Download from: ${pc.cyan("https://ollama.ai/download")}`,
                `    2. Install and open it`,
                `    3. Pull a model: ${pc.dim("ollama pull llama3.1")}`,
                `    4. Come back and run: ${pc.dim("teamclaw setup")}`,
                "",
            ].join("\n"));

            const proceed = handleCancel(
                await confirm({
                    message: "Continue setup without Ollama running?",
                    initialValue: true,
                }),
            ) as boolean;
            if (!proceed) {
                cancel("Cancelled.");
                process.exit(0);
            }
        }
    } else if (providerType === "anthropic") {
        const authMethod = handleCancel(
            await select({
                message: "How do you want to connect Anthropic?",
                options: [
                    { value: "apikey", label: "API key", hint: "Recommended · get one at console.anthropic.com" },
                    { value: "setup-token", label: "Claude Pro/Max subscription", hint: "⚠ Uses claude setup-token · unofficial path" },
                ],
            }),
        ) as string;

        if (authMethod === "setup-token") {
            entry.type = "anthropic-sub" as ProviderType;
            entry.authMethod = "setup-token";

            // Try to auto-detect an existing token
            const detected = detectClaudeOAuthToken();
            if (detected) {
                const masked = detected.slice(0, 12) + "\u2026" + detected.slice(-4);
                console.log(`\n  ${pc.green("\u2713")} Found existing Claude OAuth token: ${pc.dim(masked)}`);

                const useDetected = handleCancel(
                    await confirm({ message: "Use this token?", initialValue: true }),
                ) as boolean;
                if (useDetected) {
                    entry.setupToken = detected;
                }
            }

            if (!entry.setupToken) {
                console.log([
                    "",
                    `  ${pc.yellow("\u26a0")}  Heads up: Anthropic's ToS states that OAuth tokens from Claude Pro/Max`,
                    `     are intended for Claude Code and claude.ai only.`,
                    `     Use at your own discretion.`,
                    "",
                    `  ${pc.bold("How to get a setup token:")}`,
                    "",
                    `  ${pc.cyan("Option 1:")} Run in another terminal:`,
                    `    ${pc.dim("$")} claude setup-token`,
                    `    Copy the token it prints.`,
                    "",
                    `  ${pc.cyan("Option 2:")} Copy from Claude Code credentials:`,
                    `    ${pc.dim("$")} cat ~/.claude/.credentials.json`,
                    `    Copy the ${pc.dim("claudeAiOauth.accessToken")} value.`,
                    `    (Starts with ${pc.dim("sk-ant-oat01-")})`,
                    "",
                ].join("\n"));
                const token = handleCancel(
                    await password({ message: "Paste your setup token:" }),
                ) as string;
                entry.setupToken = token.trim();
            }
        } else {
            // API key flow
            const { PROVIDER_SETUP_HINTS, API_KEY_PREFIXES, validateApiKeyFormat } = await import("../../core/errors.js");
            const hints = PROVIDER_SETUP_HINTS.anthropic;
            const prefix = API_KEY_PREFIXES.anthropic;
            console.log("");
            for (const step of hints) {
                console.log(`  ${pc.dim(step)}`);
            }
            if (prefix) console.log(`  Starts with: ${pc.dim(prefix)}`);
            console.log(`  ${pc.dim("Your key is stored locally in ~/.teamclaw/config.json")}`);

            const apiKey = handleCancel(
                await password({ message: "Your Anthropic API key:" }),
            ) as string;

            if (!apiKey?.trim()) {
                const proceed = handleCancel(
                    await confirm({ message: "No key entered — some features won't work. Continue anyway?", initialValue: false }),
                ) as boolean;
                if (!proceed) { cancel("Cancelled."); process.exit(0); }
            } else {
                const validation = validateApiKeyFormat(providerType, apiKey.trim());
                if (validation.valid) {
                    console.log(`  ${pc.green("\u2713")} Key format looks good`);
                } else {
                    console.log(`  ${pc.yellow("\u26a0")} ${validation.hint}`);
                    const proceed = handleCancel(
                        await confirm({ message: "This key format doesn't look right. Use it anyway?", initialValue: true }),
                    ) as boolean;
                    if (!proceed) { cancel("Cancelled."); process.exit(0); }
                }
                entry.apiKey = apiKey.trim();
            }
        }
    } else if (providerType === "opencode") {
        const variant = handleCancel(
            await select({
                message: "Which OpenCode plan?",
                options: [
                    { value: "opencode-zen", label: "OpenCode Zen", hint: "Curated frontier models (Claude, GPT, Gemini)" },
                    { value: "opencode-go", label: "OpenCode Go", hint: "Curated open models ($10/mo)" },
                ],
            }),
        ) as string;
        entry.type = variant as ProviderType;

        const { PROVIDER_SETUP_HINTS, API_KEY_PREFIXES, validateApiKeyFormat } = await import("../../core/errors.js");
        const providerLabel = variant === "opencode-zen" ? "OpenCode Zen" : "OpenCode Go";
        const hints = PROVIDER_SETUP_HINTS[variant];
        const prefix = API_KEY_PREFIXES[variant];

        if (hints) {
            console.log("");
            for (const step of hints) {
                console.log(`  ${pc.dim(step)}`);
            }
        }
        if (prefix) {
            console.log(`  Starts with: ${pc.dim(prefix)}`);
        }
        console.log(`  ${pc.dim("Your key is stored locally in ~/.teamclaw/config.json")}`);

        const apiKey = handleCancel(
            await password({ message: `${providerLabel} API key:` }),
        ) as string;

        if (!apiKey?.trim()) {
            const proceed = handleCancel(
                await confirm({ message: "No key entered — some features won't work. Continue anyway?", initialValue: false }),
            ) as boolean;
            if (!proceed) { cancel("Cancelled."); process.exit(0); }
        } else {
            const validation = validateApiKeyFormat(variant, apiKey.trim());
            if (validation.valid) {
                console.log(`  ${pc.green("\u2713")} Key format looks good`);
            } else {
                console.log(`  ${pc.yellow("\u26a0")} ${validation.hint}`);
                const proceed = handleCancel(
                    await confirm({ message: "This key format doesn't look right. Use it anyway?", initialValue: true }),
                ) as boolean;
                if (!proceed) { cancel("Cancelled."); process.exit(0); }
            }
            entry.apiKey = apiKey.trim();
        }
    } else if (providerType === "gemini") {
        const authMethod = handleCancel(
            await select({
                message: "How do you want to authenticate?",
                options: [
                    { value: "apikey", label: "API key", hint: "Recommended \u00b7 free tier available" },
                    { value: "oauth", label: "Gemini subscription (OAuth)", hint: "\u26a0\ufe0f Account ban risk" },
                ],
            }),
        ) as string;

        if (authMethod === "oauth") {
            entry.type = "gemini-oauth" as ProviderType;

            const meta = PROVIDER_CATALOG["gemini-oauth"];
            if (meta?.warning) {
                console.log(`\n${meta.warning}\n`);
                const accepted = handleCancel(
                    await confirm({ message: "Do you understand and want to proceed?", initialValue: false }),
                ) as boolean;
                if (!accepted) { cancel("Cancelled."); process.exit(0); }
            }

            console.log(`  ${pc.yellow("\u26a0")} OAuth flow not yet implemented in CLI.`);
            console.log(`  ${pc.dim("Workaround: use API key instead.")}`);
        } else {
            // Standard API key flow
            const { PROVIDER_SETUP_HINTS, API_KEY_PREFIXES, validateApiKeyFormat } = await import("../../core/errors.js");
            const hints = PROVIDER_SETUP_HINTS.gemini;
            const prefix = API_KEY_PREFIXES.gemini;
            const catalogMeta = PROVIDER_CATALOG["gemini"];
            console.log("");
            if (hints) {
                for (const step of hints) {
                    console.log(`  ${pc.dim(step)}`);
                }
            } else if (catalogMeta?.keyUrl) {
                console.log(`  Get your key at: ${pc.cyan(catalogMeta.keyUrl)}`);
            }
            if (prefix) console.log(`  Starts with: ${pc.dim(prefix)}`);
            console.log(`  ${pc.dim("Your key is stored locally in ~/.teamclaw/config.json")}`);

            const apiKey = handleCancel(
                await password({ message: "Google Gemini API key:" }),
            ) as string;

            if (!apiKey?.trim()) {
                const proceed = handleCancel(
                    await confirm({ message: "No key entered — some features won't work. Continue anyway?", initialValue: false }),
                ) as boolean;
                if (!proceed) { cancel("Cancelled."); process.exit(0); }
            } else {
                const validation = validateApiKeyFormat("gemini", apiKey.trim());
                if (validation.valid) {
                    console.log(`  ${pc.green("\u2713")} Key format looks good`);
                } else {
                    console.log(`  ${pc.yellow("\u26a0")} ${validation.hint}`);
                    const proceed = handleCancel(
                        await confirm({ message: "This key format doesn't look right. Use it anyway?", initialValue: true }),
                    ) as boolean;
                    if (!proceed) { cancel("Cancelled."); process.exit(0); }
                }
                entry.apiKey = apiKey.trim();
            }
        }
    } else if (providerType === "custom") {
        const name = handleCancel(
            await text({
                message: "Provider name (for display):",
                placeholder: "my-provider",
                validate: (v) =>
                    (v ?? "").trim().length > 0 ? undefined : "Name cannot be empty",
            }),
        ) as string;
        entry.name = name.trim();

        const baseURL = handleCancel(
            await text({
                message: "Base URL (OpenAI-compatible endpoint):",
                placeholder: "https://api.example.com/v1",
                validate: (v) =>
                    (v ?? "").trim().length > 0 ? undefined : "URL cannot be empty",
            }),
        ) as string;
        entry.baseURL = baseURL.trim();

        const apiKey = handleCancel(
            await password({
                message: "API key (press Enter to skip if not required):",
            }),
        ) as string;
        if (apiKey?.trim()) entry.apiKey = apiKey.trim();
    } else {
        // All other providers that need an API key
        const { PROVIDER_URLS, API_KEY_PREFIXES, PROVIDER_SETUP_HINTS, validateApiKeyFormat } = await import("../../core/errors.js");
        const urls = PROVIDER_URLS[providerType];
        const providerLabel = PROVIDER_CHOICES.find((c) => c.value === providerType)!.label;
        const prefix = API_KEY_PREFIXES[providerType];
        const hints = PROVIDER_SETUP_HINTS[providerType];

        // Show setup instructions
        if (hints) {
            console.log("");
            for (const step of hints) {
                console.log(`  ${pc.dim(step)}`);
            }
        } else if (urls?.keyUrl) {
            console.log(`\n  Get your key at: ${pc.cyan(urls.keyUrl)}`);
        }
        if (prefix) {
            console.log(`  Starts with: ${pc.dim(prefix)}`);
        }
        console.log(`  ${pc.dim("Your key is stored locally in ~/.teamclaw/config.json")}`);

        const apiKey = handleCancel(
            await password({
                message: `${providerLabel} API key:`,
            }),
        ) as string;

        if (!apiKey?.trim()) {
            const proceed = handleCancel(
                await confirm({
                    message: "No key entered — some features won't work. Continue anyway?",
                    initialValue: false,
                }),
            ) as boolean;
            if (!proceed) {
                cancel("Cancelled.");
                process.exit(0);
            }
        } else {
            // Validate format
            const validation = validateApiKeyFormat(providerType, apiKey.trim());
            if (validation.valid) {
                console.log(`  ${pc.green("\u2713")} Key format looks good`);
            } else {
                console.log(`  ${pc.yellow("\u26a0")} ${validation.hint}`);
                const proceed = handleCancel(
                    await confirm({
                        message: "This key format doesn't look right. Use it anyway?",
                        initialValue: true,
                    }),
                ) as boolean;
                if (!proceed) {
                    cancel("Cancelled.");
                    process.exit(0);
                }
            }
            entry.apiKey = apiKey.trim();
        }
    }

    // Model selection — catalog-driven dropdown when models are available
    const catalogMeta = PROVIDER_CATALOG[entry.type];
    const catalogModels = catalogMeta?.models ?? [];
    if (catalogModels.length > 0) {
        const modelOptions = [
            ...catalogModels.map((m) => ({ value: m.id, label: m.label, hint: m.hint })),
            { value: "__custom__", label: "Other", hint: "Enter a model name manually" },
        ];
        const modelChoice = handleCancel(
            await select({ message: "Which model should your team use?", options: modelOptions, maxItems: 12 }),
        ) as string;
        if (modelChoice === "__custom__") {
            const custom = handleCancel(
                await text({ message: "Enter model name:", placeholder: catalogModels[0]?.id ?? "model-name" }),
            ) as string;
            if (custom.trim()) entry.model = custom.trim();
        } else {
            entry.model = modelChoice;
        }
    }

    // Health check — verify the API key works before continuing
    const connected = await testProviderConnection(entry);
    if (!connected) {
        const action = handleCancel(
            await select({
                message: "What would you like to do?",
                options: [
                    { value: "continue", label: "Continue anyway", hint: "You can fix the key later" },
                    { value: "reenter", label: "Re-enter API key", hint: "Try a different key" },
                ],
            }),
        ) as string;
        if (action === "reenter") {
            return promptProviderEntry();
        }
    }

    return entry;
}

function formatProviderLabel(entry: ProviderConfigEntry, index: number): string {
    const name = entry.name || entry.type;
    const model = entry.model || getDefaultModel(entry.type) || "default";
    const keyStatus = entry.apiKey ? "key set" : entry.type === "ollama" ? "local" : "no key";
    return `Provider ${index + 1}: ${pc.cyan(name)} (model: ${model}, ${keyStatus})`;
}

export async function stepProvider(state: WizardState): Promise<void> {
    state.providerEntries = [];

    // First provider is required
    const entry = await promptProviderEntry();
    state.providerEntries.push(entry);
    console.log(`  ${pc.green("+")} ${formatProviderLabel(entry, 0)}`);

    // Fallback providers loop
    while (true) {
        const addMore = handleCancel(
            await confirm({
                message: "Add a fallback provider? (used if the first one fails)",
                initialValue: false,
            }),
        ) as boolean;

        if (!addMore) break;

        const fallback = await promptProviderEntry();
        state.providerEntries.push(fallback);
        console.log(`  ${pc.green("+")} ${formatProviderLabel(fallback, state.providerEntries.length - 1)}`);
    }
}
