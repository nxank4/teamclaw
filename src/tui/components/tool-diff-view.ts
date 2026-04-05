/**
 * ToolDiffView — specialized diff display for file edit operations.
 */

import { defaultTheme } from "../themes/default.js";

export class ToolDiffView {
  static render(
    diffOutput: string,
    options: { filePath: string; terminalWidth: number; maxLines?: number },
  ): string[] {
    const prefix = `  ${defaultTheme.dim("│")} `;
    const maxLines = options.maxLines ?? 25;
    const lines: string[] = [];

    // File path header
    lines.push(prefix + defaultTheme.dim(options.filePath));

    const diffLines = diffOutput.split("\n");
    let rendered = 0;

    for (const line of diffLines) {
      if (rendered >= maxLines) {
        lines.push(prefix + defaultTheme.dim(`... (${diffLines.length - rendered} more lines)`));
        break;
      }

      if (line.startsWith("+++") || line.startsWith("---")) {
        // Skip diff headers (we show file path separately)
        continue;
      }
      if (line.startsWith("@@")) {
        lines.push(prefix + defaultTheme.primary(line));
      } else if (line.startsWith("+")) {
        lines.push(prefix + defaultTheme.success(line));
      } else if (line.startsWith("-")) {
        lines.push(prefix + defaultTheme.error(line));
      } else {
        lines.push(prefix + defaultTheme.dim(line));
      }
      rendered++;
    }

    return lines;
  }

  /** Generate a simple line diff from before/after content. */
  static generateDiff(filePath: string, before: string, after: string, contextLines = 3): string {
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    const result: string[] = [];

    result.push(`--- a/${filePath}`);
    result.push(`+++ b/${filePath}`);

    // Simple diff: find changed ranges
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    let i = 0;

    while (i < maxLen) {
      if (i < beforeLines.length && i < afterLines.length && beforeLines[i] === afterLines[i]) {
        i++;
        continue;
      }

      // Found a change — output context + change
      const start = Math.max(0, i - contextLines);
      const end = Math.min(maxLen, i + contextLines + 1);

      result.push(`@@ -${start + 1},${end - start} +${start + 1},${end - start} @@`);

      for (let j = start; j < end; j++) {
        const bLine = j < beforeLines.length ? beforeLines[j] : undefined;
        const aLine = j < afterLines.length ? afterLines[j] : undefined;

        if (bLine === aLine) {
          result.push(` ${bLine ?? ""}`);
        } else {
          if (bLine !== undefined) result.push(`-${bLine}`);
          if (aLine !== undefined) result.push(`+${aLine}`);
        }
      }

      i = end;
    }

    return result.join("\n");
  }
}
