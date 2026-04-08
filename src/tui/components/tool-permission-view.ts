/**
 * ToolPermissionView — inline confirm/reject prompt for tool execution.
 */

import { defaultTheme } from "../themes/default.js";
import type { KeyEvent } from "../core/input.js";

export type RiskLevel = "safe" | "moderate" | "dangerous" | "destructive";

export class ToolPermissionView {
  private confirmed: boolean | null = null;

  constructor(
    private executionId: string,
    private toolDisplayName: string,
    private description: string,
    private risk: RiskLevel,
    private onConfirm: () => void,
    private onReject: () => void,
  ) {}

  render(width: number): string[] {
    if (this.confirmed === true) {
      return [`  ${defaultTheme.success(defaultTheme.symbols.success)} ${defaultTheme.bold(this.toolDisplayName)}  ${defaultTheme.dim("[approved]")}`];
    }
    if (this.confirmed === false) {
      return [`  ${defaultTheme.error(defaultTheme.symbols.error)} ${defaultTheme.bold(this.toolDisplayName)}  ${defaultTheme.dim("[skipped by user]")}`];
    }

    const lines: string[] = [];
    const icon = this.risk === "safe" ? defaultTheme.symbols.pending : defaultTheme.symbols.warning;
    const iconColor = this.risk === "dangerous" || this.risk === "destructive"
      ? defaultTheme.error
      : this.risk === "moderate"
        ? defaultTheme.warning
        : defaultTheme.dim;

    const hint = this.risk === "destructive" ? "[Y/n/!]" : "[Y/n]";
    lines.push(`  ${iconColor(icon)} ${defaultTheme.bold(this.toolDisplayName)}  ${defaultTheme.dim(hint)}`);

    if (this.risk !== "safe" && this.description) {
      lines.push(`    ${defaultTheme.dim(this.description.slice(0, width - 6))}`);
    }

    return lines;
  }

  handleKey(event: KeyEvent): boolean {
    if (this.confirmed !== null) return false;

    const key = event.type === "char" ? event.char : event.type;

    if (key === "y" || key === "Y" || key === "return") {
      this.confirmed = true;
      this.onConfirm();
      return true;
    }
    if (key === "n" || key === "N" || key === "escape") {
      this.confirmed = false;
      this.onReject();
      return true;
    }
    if (key === "!" && this.risk === "destructive") {
      this.confirmed = true;
      this.onConfirm();
      return true;
    }

    return false;
  }

  get isResolved(): boolean { return this.confirmed !== null; }
  get id(): string { return this.executionId; }
}
