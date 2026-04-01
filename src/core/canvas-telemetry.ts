/**
 * Canvas Telemetry - Pushes OpenPawl state changes to the Canvas UI.
 * Uses Gateway WebSocket to emit events that the Canvas UI can display.
 *
 * Note: Gateway telemetry is currently disabled.
 * The class is retained so callers don't need to be rewritten; connect()
 * always returns false and events are silently dropped.
 */

import { logger } from "../core/logger.js";
import { wsManager } from "./ws-manager.js";
interface WsEvent { type: string; payload: unknown; }

export interface TaskEvent {
    task_id: string;
    status: "pending" | "in_progress" | "reviewing" | "completed" | "failed" | "needs_rework";
    description: string;
    assigned_to: string;
    cycle: number;
}

export class CanvasTelemetry {
    private connected = false;

    async connect(): Promise<boolean> {
        if (this.connected) {
            return true;
        }

        // Gateway telemetry disabled — no gateway configured
        logger.debug("Canvas telemetry: no gateway configured, skipping");
        return false;
    }

    private emitTelemetry(payload: Record<string, unknown>): void {
        const event: WsEvent = {
            type: "telemetry",
            payload,
        };
        wsManager.send(event);
    }

    send(event: TaskEvent): void {
        this.emitTelemetry({
            event: "openpawl_task_event",
            ...event,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendTaskStatus(taskId: string, status: TaskEvent["status"], description: string, assignedTo: string, cycle: number): void {
        this.send({
            task_id: taskId,
            status,
            description,
            assigned_to: assignedTo,
            cycle
        });
    }

    sendCycleStart(cycle: number, totalTasks: number): void {
        this.emitTelemetry({
            event: "openpawl_cycle_start",
            cycle,
            total_tasks: totalTasks,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendSessionStart(goal: string): void {
        this.emitTelemetry({
            event: "openpawl_session_start",
            goal,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendPlanningComplete(goal: string, taskCount: number): void {
        this.emitTelemetry({
            event: "openpawl_planning_complete",
            goal,
            task_count: taskCount,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendRFCEvent(taskId: string, status: "created" | "approved" | "rejected", complexity: string): void {
        this.emitTelemetry({
            event: status === "created" ? "openpawl_rfc_created" : status === "approved" ? "openpawl_rfc_approved" : "openpawl_rfc_rejected",
            task_id: taskId,
            complexity,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendStandup(botId: string, taskId: string, content: string): void {
        this.emitTelemetry({
            event: "openpawl_standup",
            bot_id: botId,
            task_id: taskId,
            content,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendMidSprint(completedCount: number, totalCount: number, remainingCount: number, vibe: string): void {
        this.emitTelemetry({
            event: "openpawl_mid_sprint",
            completed: completedCount,
            total: totalCount,
            remaining: remainingCount,
            vibe,
            timestamp: new Date().toISOString(),
            source: "openpawl",
        });
    }

    sendStreamChunk(taskId: string, botId: string, chunk: string): void {
        this.emitTelemetry({
            event: "STREAM_CHUNK",
            task_id: taskId,
            bot_id: botId,
            chunk,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendStreamDone(taskId: string, botId: string, error?: { message: string }): void {
        this.emitTelemetry({
            event: "STREAM_DONE",
            task_id: taskId,
            bot_id: botId,
            error: error ? true : false,
            error_message: error?.message,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendWaitingForHuman(taskId: string, message: string): void {
        this.emitTelemetry({
            event: "WAITING_FOR_HUMAN",
            task_id: taskId,
            message,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendTokenUsage(inputTokens: number, outputTokens: number, cachedInputTokens: number, model: string): void {
        this.emitTelemetry({
            event: "TOKEN_USAGE",
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_input_tokens: cachedInputTokens,
            model,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendReasoning(taskId: string, botId: string, reasoning: string): void {
        this.emitTelemetry({
            event: "REASONING",
            task_id: taskId,
            bot_id: botId,
            reasoning,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendNodeActive(nodeName: string): void {
        this.emitTelemetry({
            event: "NODE_ACTIVE",
            node: nodeName,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    sendSessionTimeout(reason: "timeout" | "max_runs", elapsedMs: number): void {
        this.emitTelemetry({
            event: "SESSION_TIMEOUT",
            reason,
            elapsedMs,
            timestamp: Date.now(),
            source: "openpawl",
        });
    }

    disconnect(): void {
        this.connected = false;
        wsManager.close();
    }
}

let telemetryInstance: CanvasTelemetry | null = null;

export function getCanvasTelemetry(): CanvasTelemetry {
    if (!telemetryInstance) {
        telemetryInstance = new CanvasTelemetry();
    }
    return telemetryInstance;
}

export async function initCanvasTelemetry(): Promise<boolean> {
    const telemetry = getCanvasTelemetry();
    return await telemetry.connect();
}
