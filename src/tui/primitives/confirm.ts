/**
 * Confirmation prompt renderer.
 */
import { ctp } from "../themes/default.js";

export interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerLevel?: "normal" | "warning" | "danger";
}

export function renderConfirmPrompt(options: ConfirmOptions): string {
  const { message, confirmLabel = "Yes", cancelLabel = "No" } = options;

  const color = options.dangerLevel === "danger" ? ctp.red
    : options.dangerLevel === "warning" ? ctp.yellow
    : ctp.text;

  return `${color(message)}  ${ctp.green(confirmLabel)}=${ctp.green("yes")}  ${ctp.red(cancelLabel)}=${ctp.red("no")}`;
}
