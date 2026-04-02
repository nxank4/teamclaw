/**
 * Text selection manager — tracks mouse selection state,
 * provides hit-testing, text extraction, and clipboard copy via OSC 52.
 */
import type { Terminal } from "./terminal.js";
import { stripAnsi } from "../utils/text-width.js";

export interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export class SelectionManager {
  private selection: Selection | null = null;
  private selecting = false;

  startSelection(row: number, col: number): void {
    this.selection = { startRow: row, startCol: col, endRow: row, endCol: col };
    this.selecting = true;
  }

  updateSelection(row: number, col: number): void {
    if (!this.selecting || !this.selection) return;
    this.selection.endRow = row;
    this.selection.endCol = col;
  }

  endSelection(): void {
    this.selecting = false;
  }

  getSelection(): Selection | null {
    return this.selection;
  }

  hasSelection(): boolean {
    return this.selection !== null;
  }

  isSelecting(): boolean {
    return this.selecting;
  }

  clearSelection(): void {
    this.selection = null;
    this.selecting = false;
  }

  /** Check if a cell (1-based row, 1-based col) is within the selection. */
  isSelected(row: number, col: number): boolean {
    if (!this.selection) return false;
    const s = this.normalize(this.selection);

    if (row < s.startRow || row > s.endRow) return false;
    if (row === s.startRow && row === s.endRow) {
      return col >= s.startCol && col <= s.endCol;
    }
    if (row === s.startRow) return col >= s.startCol;
    if (row === s.endRow) return col <= s.endCol;
    return true;
  }

  /** Extract selected text from screen lines (0-indexed array, but selection is 1-based). */
  getSelectedText(screenLines: string[]): string {
    if (!this.selection) return "";
    const s = this.normalize(this.selection);

    const lines: string[] = [];
    for (let row = s.startRow; row <= s.endRow; row++) {
      const line = stripAnsi(screenLines[row - 1] ?? "");
      if (row === s.startRow && row === s.endRow) {
        lines.push(line.slice(s.startCol - 1, s.endCol));
      } else if (row === s.startRow) {
        lines.push(line.slice(s.startCol - 1));
      } else if (row === s.endRow) {
        lines.push(line.slice(0, s.endCol));
      } else {
        lines.push(line);
      }
    }
    return lines.join("\n");
  }

  /** Copy text to system clipboard via OSC 52 escape sequence. */
  copyToClipboard(terminal: Terminal, text: string): void {
    if (!text) return;
    const b64 = Buffer.from(text).toString("base64");
    terminal.write(`\x1b]52;c;${b64}\x07`);
  }

  /** Get the start row of the current selection (1-based). */
  getStartRow(): number {
    return this.selection?.startRow ?? 0;
  }

  /** Select the word at position (1-based row/col). */
  selectWordAt(row: number, col: number, screenLines: string[]): void {
    const line = stripAnsi(screenLines[row - 1] ?? "");
    if (!line || col < 1 || col > line.length) {
      this.selectLine(row, screenLines);
      return;
    }
    const idx = col - 1;
    const wordChar = /[\w\-\.@\/]/;
    let start = idx;
    while (start > 0 && wordChar.test(line[start - 1]!)) start--;
    let end = idx;
    while (end < line.length - 1 && wordChar.test(line[end + 1]!)) end++;
    this.selection = { startRow: row, startCol: start + 1, endRow: row, endCol: end + 1 };
    this.selecting = false;
  }

  /** Select an entire line (1-based row). */
  selectLine(row: number, screenLines: string[]): void {
    const line = stripAnsi(screenLines[row - 1] ?? "");
    this.selection = { startRow: row, startCol: 1, endRow: row, endCol: Math.max(1, line.length) };
    this.selecting = false;
  }

  private normalize(s: Selection): Selection {
    if (s.startRow > s.endRow || (s.startRow === s.endRow && s.startCol > s.endCol)) {
      return { startRow: s.endRow, startCol: s.endCol, endRow: s.startRow, endCol: s.startCol };
    }
    return s;
  }
}
