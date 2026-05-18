/**
 * Confirmation prompt renderer.
 */
import { tokens } from "../themes/tokens.js";

export interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerLevel?: "normal" | "warning" | "danger";
}

export function renderConfirmPrompt(options: ConfirmOptions): string {
  const { message, confirmLabel = "Yes", cancelLabel = "No" } = options;

  const color = options.dangerLevel === "danger" ? tokens.ui.confirmDanger
    : options.dangerLevel === "warning" ? tokens.ui.confirmWarning
    : tokens.ui.confirmText;

  return `${color(message)}  ${tokens.ui.confirmYes(confirmLabel)}=${tokens.ui.confirmYes("yes")}  ${tokens.ui.confirmDanger(cancelLabel)}=${tokens.ui.confirmDanger("no")}`;
}
