/**
 * /error command — show technical details for the last error.
 */
import type { SlashCommand } from "../../tui/index.js";
import type { OpenPawlError } from "../../engine/errors.js";

// Module-level last error storage
let lastError: OpenPawlError | null = null;

export function setLastError(error: OpenPawlError): void {
  lastError = error;
}

export function getLastError(): OpenPawlError | null {
  return lastError;
}

export function createErrorCommand(): SlashCommand {
  return {
    name: "error",
    aliases: ["err", "debug"],
    description: "Show technical details for last error",
    async execute(_args, ctx) {
      if (!lastError) {
        ctx.addMessage("system", "No recent errors.");
        return;
      }

      const lines: string[] = ["**Technical details**\n"];
      lines.push(`  Code: ${lastError.code}`);
      lines.push(`  Time: ${lastError.technical.timestamp}`);

      if (lastError.technical.sessionId) {
        lines.push(`  Session: ${lastError.technical.sessionId}`);
      }

      if (lastError.technical.configSnapshot) {
        lines.push("\n  Config:");
        for (const [k, v] of Object.entries(lastError.technical.configSnapshot)) {
          lines.push(`    ${k}: ${v}`);
        }
      }

      if (lastError.technical.providerErrors?.length) {
        lines.push("\n  Provider errors:");
        for (const pe of lastError.technical.providerErrors) {
          lines.push(`    **${pe.provider}**:`);
          if (pe.status) lines.push(`      HTTP ${pe.status}`);
          lines.push(`      ${pe.message}`);
          if (pe.endpoint) lines.push(`      Endpoint: ${pe.endpoint}`);
          if (pe.response) lines.push(`      Response: ${pe.response.slice(0, 200)}`);
        }
      }

      if (lastError.technical.stack) {
        lines.push("\n  Stack:");
        for (const line of lastError.technical.stack.split("\n").slice(0, 5)) {
          lines.push(`    ${line.trim()}`);
        }
      }

      ctx.addMessage("system", lines.join("\n"));
    },
  };
}
