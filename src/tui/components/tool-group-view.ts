/**
 * ToolGroupView — groups consecutive tool calls from the same agent.
 */

import { defaultTheme } from "../themes/default.js";
import { ToolCallView } from "./tool-call-view.js";

export class ToolGroupView {
  private calls: ToolCallView[] = [];
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  addCall(call: ToolCallView): void {
    this.calls.push(call);
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Group header for 3+ tools
    if (this.calls.length >= 3) {
      const agentName = this.agentId;
      const count = this.calls.length;
      const header = defaultTheme.dim(`  ─ ${agentName} used ${count} tools ─`);
      lines.push(header);
    }

    for (const call of this.calls) {
      lines.push(...call.render(width));
    }

    return lines;
  }

  getCall(executionId: string): ToolCallView | undefined {
    return this.calls.find((c) => c.executionId === executionId);
  }

  get isComplete(): boolean {
    return this.calls.every((c) => {
      const s = c.status;
      return s === "completed" || s === "failed" || s === "aborted";
    });
  }

  get totalDuration(): number {
    // Duration tracking is handled at the ToolCallView state level
    return 0;
  }

  get callCount(): number {
    return this.calls.length;
  }
}
