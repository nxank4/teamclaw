/**
 * Line tracker — maps visual lines to logical content for copy/paste reconstruction.
 * When user copies visual lines, reconstructOriginal() returns the correct original text
 * without spurious line breaks inserted by wrapping.
 */

export interface LineMapping {
  visualLineStart: number;
  visualLineEnd: number;
  originalText: string;
  messageIndex: number;
  type: "user" | "agent" | "system" | "tool" | "code";
}

export class LineTracker {
  private mappings: LineMapping[] = [];

  addMapping(mapping: LineMapping): void {
    this.mappings.push(mapping);
  }

  /**
   * Reconstruct original text for a visual line range.
   * Joins with \n only at original line boundaries, not visual wrap points.
   */
  reconstructOriginal(startVisualLine: number, endVisualLine: number): string {
    const parts: string[] = [];

    for (const mapping of this.mappings) {
      // Check overlap
      if (mapping.visualLineEnd < startVisualLine || mapping.visualLineStart > endVisualLine) {
        continue;
      }

      // Fully or partially within selection
      if (mapping.visualLineStart >= startVisualLine && mapping.visualLineEnd <= endVisualLine) {
        // Entirely within selection
        parts.push(mapping.originalText);
      } else {
        // Partial — compute approximate substring
        const totalVisualLines = mapping.visualLineEnd - mapping.visualLineStart + 1;
        const overlapStart = Math.max(startVisualLine, mapping.visualLineStart);
        const overlapEnd = Math.min(endVisualLine, mapping.visualLineEnd);
        const startFraction = (overlapStart - mapping.visualLineStart) / totalVisualLines;
        const endFraction = (overlapEnd - mapping.visualLineStart + 1) / totalVisualLines;

        const textLen = mapping.originalText.length;
        const startChar = Math.floor(startFraction * textLen);
        const endChar = Math.floor(endFraction * textLen);
        parts.push(mapping.originalText.slice(startChar, endChar));
      }
    }

    return parts.join("\n");
  }

  findMessage(visualLine: number): { messageIndex: number; offset: number } | null {
    for (const mapping of this.mappings) {
      if (visualLine >= mapping.visualLineStart && visualLine <= mapping.visualLineEnd) {
        return {
          messageIndex: mapping.messageIndex,
          offset: visualLine - mapping.visualLineStart,
        };
      }
    }
    return null;
  }

  clear(): void {
    this.mappings = [];
  }

  getTotalVisualLines(): number {
    if (this.mappings.length === 0) return 0;
    return Math.max(...this.mappings.map((m) => m.visualLineEnd)) + 1;
  }

  getMappings(): LineMapping[] {
    return [...this.mappings];
  }
}
