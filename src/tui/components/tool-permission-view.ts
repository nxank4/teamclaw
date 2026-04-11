/**
 * ToolPermissionView — inline confirm/reject prompt for tool execution.
 * Renders flush-left with icon prefix, no borders.
 */

import { ctp } from "../themes/default.js";
import { bold } from "../core/ansi.js";
import type { KeyEvent } from "../core/input.js";
import { ICONS } from "../constants/icons.js";

export type RiskLevel = "safe" | "moderate" | "dangerous" | "destructive";

function riskIcon(risk: RiskLevel): { icon: string; color: (s: string) => string } {
  switch (risk) {
    case "dangerous":
    case "destructive":
      return { icon: ICONS.warning, color: ctp.yellow };
    case "moderate":
      return { icon: "\u270e", color: ctp.blue };
    default:
      return { icon: ICONS.success, color: ctp.green };
  }
}

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

  render(_width: number): string[] {
    const { icon, color } = riskIcon(this.risk);
    const lines: string[] = [];

    if (this.confirmed === true) {
      lines.push(`  ${color(icon)} ${bold(this.toolDisplayName)}  ${ctp.green(`${ICONS.success} Approved`)}`);
      return lines;
    }
    if (this.confirmed === false) {
      lines.push(`  ${color(icon)} ${bold(this.toolDisplayName)}  ${ctp.red(`${ICONS.error} Denied`)}`);
      return lines;
    }

    lines.push(`  ${color(icon)} ${bold(this.toolDisplayName)}`);
    if (this.description) {
      lines.push(`    ${ctp.overlay0(this.description)}`);
    }

    const y = ctp.green(`[${bold("Y")}]es`);
    const n = ctp.red(`[${bold("N")}]o`);
    const a = this.risk === "destructive" ? `  ${ctp.yellow(`[${bold("!")}]Always`)}` : "";
    lines.push(`    ${y}  ${n}${a}`);

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
