/**
 * Approval node - Human-in-the-loop for tasks requiring review.
 * Supports Approve, Edit, and Feedback (directives to Coordinator).
 */

import type { GraphState } from "../core/graph-state.js";
import { getApprovalKeywords } from "../core/config.js";

export interface ApprovalPending {
  task_id: string;
  description: string;
  assigned_to: string;
  priority: string;
}

export interface ApprovalResponse {
  action: "approved" | "edited" | "feedback";
  edited_task?: { description: string };
  feedback?: string;
}

export type ApprovalProvider = (pending: ApprovalPending) => Promise<ApprovalResponse>;

function taskNeedsApproval(
  task: Record<string, unknown>,
  keywords: string[]
): boolean {
  const prio = (task.priority as string) ?? "";
  if (prio === "HIGH") return true;
  const desc = ((task.description as string) ?? "").toLowerCase();
  return keywords.some((k) => desc.includes(k.toLowerCase()));
}

export function getFirstTaskNeedingApproval(
  state: GraphState,
  keywords: string[] = []
): ApprovalPending | null {
  const taskQueue = (state.task_queue ?? []) as Record<string, unknown>[];
  const pending = taskQueue.filter((t) => (t.status as string) === "pending");
  const kws = keywords.length > 0 ? keywords : getApprovalKeywords();
  for (const t of pending) {
    if (taskNeedsApproval(t, kws)) {
      return {
        task_id: (t.task_id as string) ?? "",
        description: (t.description as string) ?? "",
        assigned_to: (t.assigned_to as string) ?? "",
        priority: (t.priority as string) ?? "MEDIUM",
      };
    }
  }
  return null;
}

export function createApprovalNode(
  approvalProvider: ApprovalProvider | null
): (state: GraphState) => Promise<Partial<GraphState>> {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const keywords = getApprovalKeywords();
    const pending = getFirstTaskNeedingApproval(state, keywords);
    if (!pending) {
      return { last_action: "No task needs approval", __node__: "approval" };
    }

    let response: ApprovalResponse;
    if (approvalProvider) {
      response = await approvalProvider(pending);
    } else {
      response = { action: "approved" };
    }

    const taskQueue = [...(state.task_queue ?? [])] as Record<string, unknown>[];
    const idx = taskQueue.findIndex((t) => t.task_id === pending.task_id);

    if (response.action === "edited" && response.edited_task && idx >= 0) {
      taskQueue[idx] = {
        ...taskQueue[idx],
        description: response.edited_task.description,
      };
    }

    let userGoal = state.user_goal as string | null;
    if (response.action === "feedback" && response.feedback && idx >= 0) {
      const taskDesc = (taskQueue[idx]?.description as string) ?? "";
      userGoal = `[User feedback on task "${taskDesc.slice(0, 80)}..."]: ${response.feedback}. Revise the plan accordingly.`;
      taskQueue.splice(idx, 1);
    }

    return {
      approval_pending: null,
      approval_response: response as unknown as Record<string, unknown>,
      task_queue: taskQueue,
      user_goal: userGoal ?? undefined,
      messages: [
        response.action === "approved"
          ? `✅ Task ${pending.task_id} approved`
          : response.action === "edited"
            ? `📝 Task ${pending.task_id} edited`
            : `💬 Feedback for ${pending.task_id}: ${response.feedback}`,
      ],
      last_action: `Approval: ${response.action}`,
      __node__: "approval",
    };
  };
}
