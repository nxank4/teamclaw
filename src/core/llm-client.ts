/**
 * LLM client - Gateway (OpenAI-compatible) or Ollama.
 * Single abstraction for completions used by Coordinator, Analyst, OllamaAdapter, Sparki.
 */

import { CONFIG, getGatewayUrl, getTeamModel, getSessionTemperature } from "./config.js";

export interface GenerateOptions {
  temperature?: number;
  model?: string;
}

export async function generate(prompt: string, options?: GenerateOptions): Promise<string> {
  const gatewayUrl = getGatewayUrl();
  const temperature = options?.temperature ?? getSessionTemperature();

  if (gatewayUrl) {
    const model = options?.model ?? getTeamModel();
    const base = gatewayUrl.replace(/\/$/, "");
    const url = base.includes("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user" as const, content: prompt }],
        temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(CONFIG.llmTimeoutMs),
    });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return content.trim();
  }

  const res = await fetch(`${CONFIG.llmBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options?.model ?? CONFIG.llmModel,
      prompt,
      stream: false,
      options: { temperature },
    }),
    signal: AbortSignal.timeout(CONFIG.llmTimeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return (data.response ?? "").trim();
}

export async function llmHealthCheck(): Promise<boolean> {
  const gatewayUrl = getGatewayUrl();
  if (gatewayUrl) {
    try {
      const base = gatewayUrl.replace(/\/$/, "");
      const url = base.includes("/v1") ? `${base}/models` : `${base}/v1/models`;
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  try {
    const res = await fetch(`${CONFIG.llmBaseUrl}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const names = (data.models ?? []).map((m) => (m.name ?? "").trim());
    const model = CONFIG.llmModel.split(":")[0];
    return names.some((n) => n === CONFIG.llmModel || n.startsWith(`${model}:`) || n === model);
  } catch {
    return false;
  }
}

export function getEffectiveModel(): string {
  return getGatewayUrl() ? getTeamModel() : CONFIG.llmModel;
}
