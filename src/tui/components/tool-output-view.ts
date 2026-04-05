/**
 * ToolOutputView — renders collapsible tool output with type-specific formatting.
 */

import { defaultTheme } from "../themes/default.js";
import { wrapText } from "../utils/wrap.js";

export type OutputType = "text" | "diff" | "shell" | "code" | "json" | "none";

export class ToolOutputView {
  static detectType(toolName: string, output: string): OutputType {
    if (!output || output.trim().length === 0) return "none";
    if (toolName === "file_edit" && output.includes("@@")) return "diff";
    if (toolName === "shell_exec") return "shell";
    if (toolName === "execute_code") return "code";
    // Try JSON detection
    const trimmed = output.trim();
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 2) {
      try { JSON.parse(trimmed); return "json"; } catch { /* not json */ }
    }
    return "text";
  }

  static render(
    output: string,
    type: OutputType,
    options: { terminalWidth: number; maxLines?: number; expanded?: boolean },
  ): string[] {
    if (type === "none" || !output) return [];
    if (!options.expanded) return [];

    const innerWidth = Math.max(20, options.terminalWidth - 6);
    const maxLines = options.maxLines ?? 25;
    const prefix = `  ${defaultTheme.dim("│")} `;

    let lines: string[];
    switch (type) {
      case "diff":
        lines = renderDiff(output);
        break;
      case "shell":
        lines = renderShell(output);
        break;
      case "json":
        lines = renderJson(output, innerWidth);
        break;
      case "code":
        lines = output.split("\n").map((l) => defaultTheme.markdown.code(l));
        break;
      default:
        lines = wrapText(output, innerWidth);
        break;
    }

    // Truncate
    if (lines.length > maxLines) {
      const head = lines.slice(0, 15);
      const tail = lines.slice(-5);
      lines = [
        ...head,
        defaultTheme.dim(`... (${lines.length - 20} more lines)`),
        ...tail,
      ];
    }

    return lines.map((l) => prefix + l);
  }
}

function renderDiff(output: string): string[] {
  return output.split("\n").map((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) return defaultTheme.success(line);
    if (line.startsWith("-") && !line.startsWith("---")) return defaultTheme.error(line);
    if (line.startsWith("@@")) return defaultTheme.primary(line);
    return defaultTheme.dim(line);
  });
}

function renderShell(output: string): string[] {
  return output.split("\n").map((line) => {
    // Test result coloring
    if (/\bPASS\b|✓/.test(line)) return defaultTheme.success(line);
    if (/\bFAIL\b|✗/.test(line)) return defaultTheme.error(line);
    if (/\bWARN\b/i.test(line)) return defaultTheme.warning(line);
    if (/\bERR[!]?\b/i.test(line)) return defaultTheme.error(line);
    if (/error\s+TS\d+/.test(line)) return defaultTheme.error(line);
    return line;
  });
}

function renderJson(output: string, _width: number): string[] {
  try {
    const formatted = JSON.stringify(JSON.parse(output.trim()), null, 2);
    return formatted.split("\n");
  } catch {
    return output.split("\n");
  }
}
