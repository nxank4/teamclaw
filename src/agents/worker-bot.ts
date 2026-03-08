/**
 * Worker Bot - Executes tasks via WorkerAdapter.
 * Calls healthCheck before executeTask for fail-fast when worker is down.
 */

import type { GraphState } from "../core/graph-state.js";
import type { BotDefinition } from "../core/bot-definitions.js";
import type { WorkerAdapter } from "../interfaces/worker-adapter.js";
import { createRoutingAdapters } from "../interfaces/worker-adapter.js";
import { CONFIG } from "../core/config.js";
import type { TaskRequest, TaskResult } from "../core/state.js";

const OPENCLAW_UNAVAILABLE_MSG = "OpenClaw required but service unavailable";

function log(msg: string): void {
  if (CONFIG.verboseLogging) {
    console.log(`[worker] ${msg}`);
  }
}

export type WorkerTier = "light" | "heavy";

export class WorkerBot {
  readonly bot: BotDefinition;
  readonly adapter: WorkerAdapter;
  private readonly heavyAdapter: WorkerAdapter | null;

  constructor(
    botDefinition: BotDefinition,
    adapterImpl: WorkerAdapter,
    heavyAdapterImpl: WorkerAdapter | null = null
  ) {
    this.bot = botDefinition;
    this.adapter = adapterImpl;
    this.heavyAdapter = heavyAdapterImpl;
    log(`🤖 WorkerBot '${this.bot.name}' (${this.bot.role_id}) initialized`);
  }

  async executeTask(
    task: {
      task_id: string;
      description: string;
      priority?: string;
      estimated_cost?: number;
    },
    options?: { worker_tier?: WorkerTier }
  ): Promise<TaskResult> {
    const worker_tier = options?.worker_tier ?? "light";
    const req: TaskRequest = {
      task_id: task.task_id,
      description: task.description,
      priority: task.priority ?? "MEDIUM",
      estimated_cost: task.estimated_cost ?? 0,
    };

    if (worker_tier === "heavy" && this.heavyAdapter) {
      const healthy = await this.heavyAdapter.healthCheck();
      if (!healthy) {
        log(`Heavy task ${task.task_id} failed: OpenClaw unavailable`);
        return {
          task_id: task.task_id,
          success: false,
          output: OPENCLAW_UNAVAILABLE_MSG,
          quality_score: 0,
        };
      }
      return this.heavyAdapter.executeTask(req);
    }

    return this.adapter.executeTask(req);
  }

  async healthCheck(): Promise<boolean> {
    return this.adapter.healthCheck();
  }
}

export function createWorkerBots(
  team: BotDefinition[],
  workerUrls: Record<string, string> = {}
): Record<string, WorkerBot> {
  const bots: Record<string, WorkerBot> = {};
  for (const bot of team) {
    const { light, heavy } = createRoutingAdapters(bot, workerUrls);
    bots[bot.id] = new WorkerBot(bot, light, heavy);
  }
  return bots;
}

export function createWorkerExecuteNode(
  workerBots: Record<string, WorkerBot>
): (state: GraphState) => Promise<Partial<GraphState>> {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const taskQueue = [...(state.task_queue ?? [])];
    const botStats = { ...(state.bot_stats ?? {}) };

    const pending = taskQueue.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      return { last_action: "No pending tasks", __node__: "worker_execute" };
    }

    const taskItem = pending[0];
    const taskId = (taskItem.task_id as string) ?? "?";
    const assignedTo = (taskItem.assigned_to as string) ?? "";
    const description = (taskItem.description as string) ?? "";

    const worker = workerBots[assignedTo];
    if (!worker) {
      log(`Worker ${assignedTo} not found, skipping task ${taskId}`);
      const idx = taskQueue.findIndex((t) => t.task_id === taskId);
      if (idx >= 0) {
        taskQueue[idx] = {
          ...taskItem,
          status: "failed",
          result: { success: false, output: "Worker not found" },
        };
      }
      return { task_queue: taskQueue, last_action: "Worker not found", __node__: "worker_execute" };
    }

    const healthy = await worker.healthCheck();
    if (!healthy) {
      log(`Worker ${assignedTo} unreachable, failing task ${taskId}`);
      const idx = taskQueue.findIndex((t) => t.task_id === taskId);
      if (idx >= 0) {
        taskQueue[idx] = {
          ...taskItem,
          status: "failed",
          result: { success: false, output: "Worker unreachable (health check failed)" },
        };
      }
      const stats = botStats[assignedTo] ?? { tasks_completed: 0, tasks_failed: 0 };
      botStats[assignedTo] = {
        ...stats,
        tasks_failed: ((stats.tasks_failed as number) ?? 0) + 1,
      };
      return {
        task_queue: taskQueue,
        bot_stats: botStats,
        last_action: `Worker ${assignedTo} unreachable`,
        __node__: "worker_execute",
      };
    }

    const taskIdx = taskQueue.findIndex((t) => t.task_id === taskId);
    if (taskIdx >= 0) {
      taskQueue[taskIdx] = {
        ...taskQueue[taskIdx],
        status: "in_progress",
        in_progress_at: new Date().toISOString(),
      };
    }

    const stats = botStats[assignedTo] ?? {
      tasks_completed: 0,
      tasks_failed: 0,
    };

    const worker_tier = (taskItem.worker_tier as WorkerTier) ?? "light";
    const result = await worker.executeTask(
      {
        task_id: taskId,
        description,
        priority: (taskItem.priority as string) ?? "MEDIUM",
        estimated_cost: 0,
      },
      { worker_tier }
    );
    botStats[assignedTo] = {
      ...stats,
      tasks_completed: ((stats.tasks_completed as number) ?? 0) + (result.success ? 1 : 0),
      tasks_failed: ((stats.tasks_failed as number) ?? 0) + (result.success ? 0 : 1),
    };

    if (taskIdx >= 0) {
      taskQueue[taskIdx] = {
        ...taskQueue[taskIdx],
        status: result.success ? "completed" : "failed",
        result,
      };
    }

    const agentMessages = [...(state.agent_messages ?? [])];
    if (result.success && result.output) {
      const ts = new Date().toTimeString().slice(0, 8);
      const summary = result.output.slice(0, 120).replace(/\n/g, " ");
      agentMessages.push({
        from_bot: assignedTo,
        to_bot: "all",
        content: `Task ${taskId} done: ${summary}${result.output.length > 120 ? "..." : ""}`,
        timestamp: ts,
      });
    }

    return {
      task_queue: taskQueue,
      bot_stats: botStats,
      agent_messages: agentMessages,
      last_action: `Worker ${assignedTo} completed ${taskId}`,
      messages: [`🤖 ${worker.bot.name}: ${taskId} ${result.success ? "✅" : "❌"}`],
      last_quality_score: Math.round(result.quality_score * 100),
      __node__: "worker_execute",
    };
  };
}

