/**
 * WorkerAdapter - Pluggable worker interface for TeamClaw.
 * Supports OpenClaw, Ollama, and generic HTTP endpoints.
 * healthCheck enables fail-fast before assigning tasks.
 */

import type { TaskRequest, TaskResult } from "../core/state.js";
import { CONFIG, getSessionTemperature } from "../core/config.js";
import { generate, llmHealthCheck, getEffectiveModel } from "../core/llm-client.js";

export type WorkerAdapterType = "openclaw" | "ollama" | "http";

export interface WorkerAdapter {
  executeTask(task: TaskRequest): Promise<TaskResult>;
  healthCheck(): Promise<boolean>;
  getStatus(): Promise<Record<string, unknown>>;
  reset(): Promise<void>;
  readonly adapterType: WorkerAdapterType;
}

function log(msg: string): void {
  if (CONFIG.verboseLogging) {
    console.log(`[worker-adapter] ${msg}`);
  }
}

export class OllamaAdapter implements WorkerAdapter {
  readonly adapterType: WorkerAdapterType = "ollama";
  readonly agentId: string;
  tasksProcessed = 0;
  private llmAvailable = false;

  constructor(agentId = "sparki-001") {
    this.agentId = agentId;
    this.llmAvailable = true;
    log(`OllamaAdapter '${agentId}' initialized`);
  }

  async healthCheck(): Promise<boolean> {
    const ok = await llmHealthCheck();
    if (!ok) log(`LLM health check failed`);
    return ok;
  }

  async executeTask(task: TaskRequest): Promise<TaskResult> {
    log(`OllamaAdapter executing task: ${task.task_id}`);
    this.tasksProcessed += 1;

    let plan: string;
    let quality: number;
    let success: boolean;

    try {
      plan = await this._generatePlanWithLlm(task);
      if (!plan) {
        plan = this._getFallbackPlan(task);
        quality = 0.5;
        success = true;
      } else {
        quality = this._estimateQuality(plan);
        success = quality > 0.3;
      }
    } catch (err) {
      log(`LLM unavailable: ${err}. Using fallback.`);
      this.llmAvailable = false;
      plan = this._getFallbackPlan(task);
      quality = 0.5;
      success = true;
    }

    log(`${success ? "✅" : "❌"} Task ${task.task_id} completed (Quality: ${quality.toFixed(2)})`);
    return { task_id: task.task_id, success, output: plan, quality_score: quality };
  }

  private async _generatePlanWithLlm(task: TaskRequest): Promise<string> {
    const prompt = `You are a software developer AI agent working in a team.

Task ID: ${task.task_id}
Priority: ${task.priority}
Description: ${task.description}

Generate a concise development plan (3-5 bullet points). Be specific and practical.

Development Plan:`;
    try {
      return await generate(prompt, { temperature: getSessionTemperature() });
    } catch (err) {
      this.llmAvailable = false;
      throw err;
    }
  }

  private _getFallbackPlan(task: TaskRequest): string {
    return `Development Plan for: ${task.description}

1. Analyze requirements and define scope
2. Design architecture and select technologies
3. Implement core functionality with tests
4. Integrate and document

Status: Ready for implementation (fallback mode)`;
  }

  private _estimateQuality(plan: string): number {
    if (!plan || plan.length < 50) return 0.2;
    let quality = 0.5;
    if (/[12]\.|-|\*/.test(plan)) quality += 0.2;
    if (plan.length > 200) quality += 0.1;
    if (plan.length > 400) quality += 0.2;
    return Math.min(quality, 1);
  }

  async getStatus(): Promise<Record<string, unknown>> {
    return {
      agent_id: this.agentId,
      type: "ollama",
      tasks_processed: this.tasksProcessed,
      llm_available: this.llmAvailable,
      model: this.llmAvailable ? getEffectiveModel() : "fallback",
    };
  }

  async reset(): Promise<void> {
    this.tasksProcessed = 0;
    log(`OllamaAdapter '${this.agentId}' reset`);
  }
}

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;

export class OpenClawAdapter implements WorkerAdapter {
  readonly adapterType: WorkerAdapterType = "openclaw";
  readonly workerUrl: string;
  private readonly authToken: string | null;
  private readonly timeout: number;
  tasksProcessed = 0;

  constructor(options: { workerUrl?: string; authToken?: string | null; timeout?: number } = {}) {
    this.workerUrl = (options.workerUrl ?? "http://localhost:8001").replace(/\/$/, "");
    this.authToken = options.authToken ?? null;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    log(`OpenClawAdapter → ${this.workerUrl}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.workerUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (err) {
      log(`OpenClaw health check failed: ${err}`);
      return false;
    }
  }

  async executeTask(task: TaskRequest): Promise<TaskResult> {
    const payload = {
      task_id: task.task_id,
      description: task.description,
      priority: task.priority,
      estimated_cost: task.estimated_cost ?? 0,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers["Authorization"] = `Bearer ${this.authToken}`;

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), this.timeout);

        const res = await fetch(`${this.workerUrl}/execute`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as {
          task_id: string;
          success: boolean;
          output: string;
          quality_score?: number;
        };

        this.tasksProcessed += 1;
        log(`${data.success ? "✅" : "❌"} Worker returned: ${data.task_id}`);
        return {
          task_id: data.task_id,
          success: data.success,
          output: data.output,
          quality_score: data.quality_score ?? 0.5,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        log(`Worker failed (attempt ${attempt}/${MAX_RETRIES}): ${lastErr.message}`);
      }
    }

    return {
      task_id: task.task_id,
      success: false,
      output: `Worker unreachable: ${lastErr}`,
      quality_score: 0,
    };
  }

  async getStatus(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(`${this.workerUrl}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      return { status: "unreachable", error: String(err) };
    }
  }

  async reset(): Promise<void> {
    try {
      const res = await fetch(`${this.workerUrl}/reset`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.tasksProcessed = 0;
    } catch (err) {
      log(`Reset failed: ${err}`);
    }
  }
}

export class HttpAdapter implements WorkerAdapter {
  readonly adapterType: WorkerAdapterType = "http";
  readonly endpoint: string;
  private readonly authToken: string | null;
  private readonly timeout: number;

  constructor(options: {
    endpoint: string;
    authToken?: string | null;
    timeout?: number;
  }) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.authToken = options.authToken ?? null;
    this.timeout = options.timeout ?? 60_000;
    log(`HttpAdapter → ${this.endpoint}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = `${this.endpoint}/health`;
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      try {
        const res = await fetch(this.endpoint, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      } catch (err) {
        log(`HttpAdapter health check failed: ${err}`);
        return false;
      }
    }
  }

  async executeTask(task: TaskRequest): Promise<TaskResult> {
    const payload = {
      task_id: task.task_id,
      description: task.description,
      priority: task.priority,
      estimated_cost: task.estimated_cost ?? 0,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers["Authorization"] = `Bearer ${this.authToken}`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), this.timeout);

    try {
      const res = await fetch(`${this.endpoint}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          task_id: task.task_id,
          success: false,
          output: `HTTP ${res.status}`,
          quality_score: 0,
        };
      }

      const data = (await res.json()) as {
        task_id?: string;
        success?: boolean;
        output?: string;
        quality_score?: number;
      };

      return {
        task_id: data.task_id ?? task.task_id,
        success: data.success ?? false,
        output: data.output ?? "",
        quality_score: data.quality_score ?? 0.5,
      };
    } catch (err) {
      return {
        task_id: task.task_id,
        success: false,
        output: `Request failed: ${err}`,
        quality_score: 0,
      };
    }
  }

  async getStatus(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(`${this.endpoint}/health`);
      return res.ok ? ((await res.json()) as Record<string, unknown>) : { status: "error" };
    } catch {
      return { status: "unreachable" };
    }
  }

  async reset(): Promise<void> {
    try {
      await fetch(`${this.endpoint}/reset`, { method: "POST" });
    } catch {
      // ignore
    }
  }
}

const AUTH_TOKEN = CONFIG.openclawAuthToken?.trim() || null;

export function createWorkerAdapter(
  bot: { id: string; worker_url?: string | null; adapter_type?: WorkerAdapterType },
  workerUrls: Record<string, string> = {}
): WorkerAdapter {
  const url = bot.worker_url ?? workerUrls[bot.id];
  const adapterType = bot.adapter_type ?? (url ? "openclaw" : "ollama");

  if (adapterType === "http" && url) {
    return new HttpAdapter({ endpoint: url, authToken: AUTH_TOKEN });
  }
  if (url) {
    return new OpenClawAdapter({ workerUrl: url, authToken: AUTH_TOKEN });
  }
  return new OllamaAdapter(bot.id);
}

export function createRoutingAdapters(
  bot: { id: string; worker_url?: string | null; adapter_type?: WorkerAdapterType },
  workerUrls: Record<string, string> = {}
): { light: WorkerAdapter; heavy: WorkerAdapter | null } {
  const light = new OllamaAdapter(bot.id);
  const url = bot.worker_url ?? workerUrls[bot.id];
  const adapterType = bot.adapter_type ?? (url ? "openclaw" : "ollama");
  let heavy: WorkerAdapter | null = null;
  if (url && adapterType !== "http") {
    heavy = new OpenClawAdapter({ workerUrl: url, authToken: AUTH_TOKEN });
  }
  return { light, heavy };
}
