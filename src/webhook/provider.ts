/**
 * Webhook-based PerTaskApprovalProvider implementation.
 * Posts approval requests to an external URL and waits for signed callbacks.
 */

import type { PartialApprovalTask, PartialApprovalDecision, PerTaskApprovalProvider } from "../agents/partial-approval.js";
import type { WebhookApprovalConfig, ApprovalWebhookPayload } from "./types.js";
import { createTokenManager } from "./tokens.js";
import { deliverApprovalRequest, deliverWebhook, deliverTimeoutNotification } from "./delivery.js";
import { formatSlackApprovalBatch } from "./slack.js";
import { setTaskApprovalResolver, clearAllTaskApprovalResolvers } from "../web/session-state.js";
import { logger } from "../core/logger.js";

export function createWebhookApprovalProvider(
  config: WebhookApprovalConfig,
  fallbackProvider?: PerTaskApprovalProvider | null,
): PerTaskApprovalProvider {
  const tokenManager = createTokenManager(config.secret);

  return async (tasks: PartialApprovalTask[]): Promise<Map<string, PartialApprovalDecision>> => {
    const decisions = new Map<string, PartialApprovalDecision>();
    const manualTasks = tasks.filter((t) => !t.is_auto_approved);
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Pre-approve auto-approved tasks
    for (const task of tasks) {
      if (task.is_auto_approved) {
        decisions.set(task.task_id, { action: "approve" });
      }
    }

    if (manualTasks.length === 0) {
      return decisions;
    }

    // Deliver webhooks
    const payloads: ApprovalWebhookPayload[] = [];
    const failedTasks: PartialApprovalTask[] = [];

    for (const task of manualTasks) {
      const { payload, result } = await deliverApprovalRequest(config, task, tokenManager);
      payloads.push(payload);
      if (!result.ok) {
        logger.warn(`Webhook delivery failed for task ${task.task_id}: ${result.error}`);
        failedTasks.push(task);
      }
    }

    // Slack batch: send a single combined message
    if (config.provider === "slack" && payloads.length > 0) {
      const successTasks = manualTasks.filter((t) => !failedTasks.includes(t));
      if (successTasks.length > 0) {
        const successPayloads = payloads.filter(
          (_, i) => !failedTasks.includes(manualTasks[i]),
        );
        const slackPayload = formatSlackApprovalBatch(successTasks, successPayloads, config);
        await deliverWebhook(config.url, config.secret, slackPayload, config.retryAttempts);
      }
    }

    // Handle failed deliveries: fallback or auto-approve
    for (const task of failedTasks) {
      if (fallbackProvider) {
        logger.warn(`Falling back to dashboard provider for task ${task.task_id}`);
      } else {
        logger.warn(`Auto-approving task ${task.task_id} (webhook delivery failed, no fallback)`);
        decisions.set(task.task_id, { action: "approve" });
      }
    }

    // If all tasks failed and we have a fallback, delegate entirely
    const pendingTasks = manualTasks.filter((t) => !failedTasks.includes(t));
    if (failedTasks.length > 0 && fallbackProvider) {
      const fallbackDecisions = await fallbackProvider(failedTasks);
      for (const [id, decision] of fallbackDecisions) {
        decisions.set(id, decision);
      }
    }

    if (pendingTasks.length === 0) {
      return decisions;
    }

    // Set up per-task promise resolvers for webhook callbacks
    return new Promise<Map<string, PartialApprovalDecision>>((resolve) => {
      let remaining = pendingTasks.length;

      const checkDone = () => {
        if (remaining <= 0) {
          for (const timer of timers) clearTimeout(timer);
          clearAllTaskApprovalResolvers();
          resolve(decisions);
        }
      };

      for (const task of pendingTasks) {
        setTaskApprovalResolver(task.task_id, (decision) => {
          decisions.set(task.task_id, decision);
          remaining--;
          checkDone();
        });

        // Timeout → auto-escalate
        const timer = setTimeout(() => {
          if (!decisions.has(task.task_id)) {
            logger.warn(`Webhook approval timed out for task ${task.task_id}, auto-escalating`);
            decisions.set(task.task_id, { action: "escalate" });
            remaining--;
            deliverTimeoutNotification(config, task.task_id).catch(() => {});
            checkDone();
          }
        }, config.timeoutSeconds * 1000);

        timers.push(timer);
      }
    });
  };
}

/** Shared token manager instance accessor — exported for use by server routes. */
export { createTokenManager } from "./tokens.js";
