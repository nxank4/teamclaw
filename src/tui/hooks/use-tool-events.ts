/**
 * ToolEventHandler — subscribes to tool stream events,
 * manages ToolCallView lifecycle, handles permissions.
 */

import { ToolCallView } from "../components/tool-call-view.js";
import { ToolGroupView } from "../components/tool-group-view.js";
import { ToolPermissionView } from "../components/tool-permission-view.js";
import type { RiskLevel } from "../components/tool-permission-view.js";
import { ToolEvent } from "../../router/event-types.js";

export interface ToolStreamEvent {
  type: string;
  sessionId?: string;
  agentId?: string;
  executionId?: string;
  toolName?: string;
  toolDisplayName?: string;
  inputSummary?: string;
  message?: string;
  success?: boolean;
  outputSummary?: string;
  fullOutput?: string;
  duration?: number;
  risk?: RiskLevel;
  description?: string;
  approved?: boolean;
}

export class ToolEventHandler {
  private activeTools = new Map<string, ToolCallView>();
  private activeGroups = new Map<string, ToolGroupView>();
  private pendingPermissions = new Map<string, ToolPermissionView>();
  private lastAgentWithText = new Set<string>();

  constructor(
    private onRender: () => void,
    private onPermissionResolved: (executionId: string, approved: boolean) => void,
  ) {}

  handleEvent(event: ToolStreamEvent): void {
    switch (event.type) {
      case ToolEvent.Start: {
        const view = new ToolCallView({
          executionId: event.executionId!,
          toolName: event.toolName!,
          agentId: event.agentId!,
          status: "running",
          inputSummary: event.inputSummary ?? "",
        });
        this.activeTools.set(event.executionId!, view);

        // Add to agent's current group
        const agentId = event.agentId!;
        if (this.lastAgentWithText.has(agentId)) {
          // Text was emitted since last tool → start new group
          this.activeGroups.delete(agentId);
          this.lastAgentWithText.delete(agentId);
        }
        let group = this.activeGroups.get(agentId);
        if (!group) {
          group = new ToolGroupView(agentId);
          this.activeGroups.set(agentId, group);
        }
        group.addCall(view);

        this.onRender();
        break;
      }

      case "tool:progress" as string: {
        const view = this.activeTools.get(event.executionId!);
        if (view) {
          view.updateProgress(event.message ?? "");
          this.onRender();
        }
        break;
      }

      case ToolEvent.Done: {
        const view = this.activeTools.get(event.executionId!);
        if (view) {
          view.complete({
            success: event.success ?? false,
            summary: event.outputSummary ?? "",
            fullOutput: event.fullOutput,
            duration: event.duration ?? 0,
          });
          this.onRender();
        }
        break;
      }

      case ToolEvent.ConfirmationNeeded: {
        const permView = new ToolPermissionView(
          event.executionId!,
          event.toolDisplayName ?? event.toolName ?? "Tool",
          event.description ?? "",
          event.risk ?? "moderate",
          () => this.onPermissionResolved(event.executionId!, true),
          () => this.onPermissionResolved(event.executionId!, false),
        );
        this.pendingPermissions.set(event.executionId!, permView);

        // Also create a pending ToolCallView
        const view = new ToolCallView({
          executionId: event.executionId!,
          toolName: event.toolName ?? "unknown",
          agentId: event.agentId ?? "unknown",
          status: "pending",
          inputSummary: event.description ?? "",
        });
        this.activeTools.set(event.executionId!, view);
        this.onRender();
        break;
      }

      case "tool:confirmed" as string: {
        const permView = this.pendingPermissions.get(event.executionId!);
        if (permView) {
          this.pendingPermissions.delete(event.executionId!);
        }
        // Transition tool view
        const toolView = this.activeTools.get(event.executionId!);
        if (toolView && event.approved) {
          // Will be set to "running" by subsequent tool:start
        }
        this.onRender();
        break;
      }

      case "agent:token": {
        // Text token arrived — break current tool group
        if (event.agentId) {
          this.lastAgentWithText.add(event.agentId);
        }
        break;
      }
    }
  }

  handleKey(event: { type: string; char?: string }): boolean {
    // Check pending permissions first
    for (const perm of this.pendingPermissions.values()) {
      if (!perm.isResolved) {
        return perm.handleKey(event as import("../core/input.js").KeyEvent);
      }
    }
    return false;
  }

  getToolViews(): Array<ToolCallView | ToolGroupView> {
    return [...this.activeGroups.values()];
  }

  getPendingPermission(): ToolPermissionView | null {
    for (const perm of this.pendingPermissions.values()) {
      if (!perm.isResolved) return perm;
    }
    return null;
  }

  dispose(): void {
    this.activeTools.clear();
    this.activeGroups.clear();
    this.pendingPermissions.clear();
  }
}
