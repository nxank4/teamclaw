/**
 * Orchestrate conversation patterns: clarify → confirm → preview → proceed.
 */

import type { FlowDecision } from "./types.js";
import type { RouteDecision } from "../router/router-types.js";
import { ClarificationDetector } from "./clarification.js";
import { ConfirmationGate } from "./confirmation-gate.js";
import { PlanPreview } from "./plan-preview.js";

export class FlowController {
  private clarification = new ClarificationDetector();
  private confirmation: ConfirmationGate;
  private planPreview = new PlanPreview();

  constructor(costThreshold?: number) {
    this.confirmation = new ConfirmationGate(costThreshold);
  }

  async preExecutionCheck(
    prompt: string,
    decision: RouteDecision,
    context: {
      trackedFiles?: string[];
      estimatedCost?: number;
      fileCount?: number;
    },
  ): Promise<FlowDecision> {
    // 1. Clarification check
    const clarification = this.clarification.detect(prompt, { trackedFiles: context.trackedFiles });
    if (clarification && clarification.severity === "ask") {
      return { type: "clarify", questions: clarification.questions };
    }

    // 2. Confirmation gate
    const confirmReq = this.confirmation.shouldConfirm(decision, {
      estimatedCost: context.estimatedCost ?? 0,
      fileCount: context.fileCount ?? 0,
      hasDestructive: decision.agents.some((a) => a.tools.includes("file_write") || a.tools.includes("shell_exec")),
      isMultiAgent: decision.agents.length > 1,
    });
    if (confirmReq) {
      return { type: "confirm", request: confirmReq };
    }

    // 3. Plan preview for orchestrated strategy
    if (decision.strategy === "orchestrated" && decision.agents.length > 2) {
      const preview = this.planPreview.generatePreview(decision);
      return { type: "preview", data: preview };
    }

    return { type: "proceed" };
  }
}
