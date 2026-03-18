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
import type { ProviderConfigEntry } from "../../core/global-config.js";
import { randomPhrase } from "../../utils/spinner-phrases.js";

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
        cancel("Setup cancelled.");
        process.exit(0);
    }
    return v;
}

type ProviderType = ProviderConfigEntry["type"];

const PROVIDER_CHOICES: Array<{ value: ProviderType; label: string; hint?: string }> = [
    { value: "anthropic", label: "Anthropic", hint: "recommended" },
    { value: "openai", label: "OpenAI" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "ollama", label: "Ollama", hint: "local" },
    { value: "deepseek", label: "DeepSeek" },
    { value: "groq", label: "Groq" },
    { value: "custom", label: "Custom" },
];

const DEFAULT_MODELS: Record<ProviderType, string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    openrouter: "anthropic/claude-sonnet-4-20250514",
    ollama: "llama3.1",
    deepseek: "deepseek-chat",
    groq: "llama-3.3-70b-versatile",
    custom: "",
};

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

async function promptProviderEntry(): Promise<ProviderConfigEntry> {
    const providerType = handleCancel(
        await select({
            message: "Select a provider:",
            options: PROVIDER_CHOICES,
        }),
    ) as ProviderType;

    const entry: ProviderConfigEntry = { type: providerType };

    if (providerType === "ollama") {
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
            const proceed = handleCancel(
                await confirm({
                    message: "Ollama is not reachable. Continue anyway?",
                    initialValue: true,
                }),
            ) as boolean;
            if (!proceed) {
                cancel("Setup cancelled.");
                process.exit(0);
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
        // Anthropic, OpenAI, OpenRouter, DeepSeek, Groq — all need an API key
        const keyHint = providerType === "anthropic" ? " (starts with sk-ant-)" : "";
        const apiKey = handleCancel(
            await password({
                message: `${PROVIDER_CHOICES.find((c) => c.value === providerType)!.label} API key${keyHint}:`,
            }),
        ) as string;

        if (!apiKey?.trim()) {
            const proceed = handleCancel(
                await confirm({
                    message: "No API key entered. Continue without one?",
                    initialValue: false,
                }),
            ) as boolean;
            if (!proceed) {
                cancel("Setup cancelled.");
                process.exit(0);
            }
        } else {
            entry.apiKey = apiKey.trim();
        }
    }

    // Model override
    const defaultModel = DEFAULT_MODELS[providerType] || "";
    const modelInput = handleCancel(
        await text({
            message: `Model override (leave empty for default${defaultModel ? `: ${defaultModel}` : ""}):`,
            initialValue: "",
            placeholder: defaultModel || "default",
        }),
    ) as string;
    if (modelInput?.trim()) {
        entry.model = modelInput.trim();
    }

    return entry;
}

function formatProviderLabel(entry: ProviderConfigEntry, index: number): string {
    const name = entry.name || entry.type;
    const model = entry.model || DEFAULT_MODELS[entry.type] || "default";
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
                message: "Add another provider as fallback?",
                initialValue: false,
            }),
        ) as boolean;

        if (!addMore) break;

        const fallback = await promptProviderEntry();
        state.providerEntries.push(fallback);
        console.log(`  ${pc.green("+")} ${formatProviderLabel(fallback, state.providerEntries.length - 1)}`);
    }
}
