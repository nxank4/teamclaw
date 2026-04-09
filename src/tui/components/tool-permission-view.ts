/**
 * ToolPermissionView — inline confirm/reject prompt for tool execution.
 * Uses renderConfirmBox for consistent bordered layout.
 */

import { ctp } from "../themes/default.js";
import { bold } from "../core/ansi.js";
import { renderConfirmBox } from "./confirm-box.js";
import type { KeyEvent } from "../core/input.js";

export type RiskLevel = "safe" | "moderate" | "dangerous" | "destructive";

function riskIcon(risk: RiskLevel): { icon: string; color: (s: string) => string } {
  switch (risk) {
    case "dangerous":
    case "destructive":
      return { icon: "\u26a0", color: ctp.yellow };
    case "moderate":
      return { icon: "\u270e", color: ctp.blue };
    default:
      return { icon: "\u2713", color: ctp.green };
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
    const title = `${color(icon)} ${bold(this.toolDisplayName)}`;

    if (this.confirmed === true) {
      return renderConfirmBox({
        title,
        contentLines: [ctp.green("\u2713 Approved")],
        buttons: "",
        borderColor: ctp.surface1,
        titleColor: (s: string) => s,
      }).split("\n");
    }
    if (this.confirmed === false) {
      return renderConfirmBox({
        title,
        contentLines: [ctp.red("\u2717 Denied")],
        buttons: "",
        borderColor: ctp.surface1,
        titleColor: (s: string) => s,
      }).split("\n");
    }

    const contentLines: string[] = [];
    if (this.description) {
      contentLines.push(ctp.overlay0(this.description));
    }

    const y = ctp.green(`[${bold("Y")}]es`);
    const n = ctp.red(`[${bold("N")}]o`);
    const a = this.risk === "destructive" ? `    ${ctp.yellow(`[${bold("!")}]Always`)}` : "";
    const buttons = `${y}    ${n}${a}`;

    return renderConfirmBox({
      title,
      contentLines,
      buttons,
      borderColor: ctp.surface1,
      titleColor: (s: string) => s,
    }).split("\n");
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
