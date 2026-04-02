/**
 * Messages component — scrollable chat message list.
 * Supports streaming append for token-by-token display.
 */
import type { Component } from "../core/component.js";
import type { KeyEvent } from "../core/input.js";
import { wrapText } from "../utils/wrap.js";
import { visibleWidth } from "../utils/text-width.js";
import { defaultTheme } from "../themes/default.js";

export interface ChatMessage {
  role: "user" | "assistant" | "agent" | "tool" | "system" | "error";
  content: string;
  agentName?: string;
  agentColor?: (s: string) => string;
  timestamp?: Date;
  collapsible?: boolean;
  collapsed?: boolean;
}

export class MessagesComponent implements Component {
  readonly id: string;
  readonly focusable = true;

  private messages: ChatMessage[] = [];
  private scrollOffset = 0;
  private maxHeight: number;
  private autoScroll = true;

  constructor(id: string, maxHeight = 100) {
    this.id = id;
    this.maxHeight = maxHeight;
  }

  render(width: number): string[] {
    const allLines: string[] = [];
    const maxBubbleWidth = Math.min(Math.floor(width * 0.70), width - 8);

    for (const msg of this.messages) {
      switch (msg.role) {
        case "user": {
          // RIGHT aligned, colored background bubble
          const wrapped = wrapText(msg.content || "", maxBubbleWidth - 2);
          const contentWidth = wrapped.reduce((max, l) => Math.max(max, visibleWidth(l)), 0);
          const bubbleWidth = contentWidth + 2; // 1 char padding each side
          for (const line of wrapped) {
            const padRight = contentWidth - visibleWidth(line);
            const padded = ` ${line}${" ".repeat(padRight)} `;
            const bubble = defaultTheme.userBubble(padded);
            const leftPad = " ".repeat(Math.max(0, width - bubbleWidth - 1));
            allLines.push(leftPad + bubble);
          }
          break;
        }
        case "assistant":
        case "agent": {
          // LEFT aligned, with agent name label
          const nameLabel = msg.agentName ?? msg.role;
          const nameFn = msg.agentColor ?? defaultTheme.agentName;
          allLines.push("  " + nameFn(nameLabel));
          const wrapped = wrapText(msg.content || "", maxBubbleWidth);
          for (const line of wrapped) {
            allLines.push("  " + line);
          }
          break;
        }
        case "error": {
          // LEFT aligned, red with prefix
          const wrapped = wrapText(msg.content || "", maxBubbleWidth - 2);
          for (const line of wrapped) {
            allLines.push("  " + defaultTheme.error("✗ " + line));
          }
          break;
        }
        case "tool": {
          // LEFT aligned, dim monospace
          allLines.push("  " + defaultTheme.dim("⚙ " + (msg.content || "")));
          break;
        }
        default: {
          // system and others — LEFT aligned, dim
          const wrapped = wrapText(msg.content || "", maxBubbleWidth);
          for (const line of wrapped) {
            allLines.push("  " + defaultTheme.dim(line));
          }
          break;
        }
      }
      allLines.push(""); // spacing between messages
    }

    // Apply scroll viewport
    const visibleLines = allLines.slice(this.scrollOffset, this.scrollOffset + this.maxHeight);
    return visibleLines;
  }

  onKey(event: KeyEvent): boolean {
    if (event.type === "arrow" && event.direction === "up") {
      this.scrollUp(3);
      return true;
    }
    if (event.type === "arrow" && event.direction === "down") {
      this.scrollDown(3);
      return true;
    }
    if (event.type === "pageup") {
      this.scrollUp(this.maxHeight);
      return true;
    }
    if (event.type === "pagedown") {
      this.scrollDown(this.maxHeight);
      return true;
    }
    if (event.type === "home") {
      this.scrollOffset = 0;
      this.autoScroll = false;
      return true;
    }
    if (event.type === "end") {
      this.scrollToBottom();
      return true;
    }
    return false;
  }

  addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  /** Append text to the last message (streaming). */
  appendToLast(chunk: string): void {
    if (this.messages.length === 0) {
      this.messages.push({ role: "assistant", content: chunk });
    } else {
      const last = this.messages[this.messages.length - 1]!;
      last.content += chunk;
    }
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  clear(): void {
    this.messages = [];
    this.scrollOffset = 0;
    this.autoScroll = true;
  }

  scrollUp(lines: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
    this.autoScroll = false;
  }

  scrollDown(lines: number): void {
    this.scrollOffset += lines;
    // Don't let scroll past content
    this.autoScroll = false;
  }

  scrollToBottom(): void {
    // Will be clamped during render
    this.scrollOffset = Math.max(0, this.getTotalLines() - this.maxHeight);
    this.autoScroll = true;
  }

  isAtBottom(): boolean {
    return this.autoScroll;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  private getTotalLines(): number {
    // Approximate — each message is content lines + prefix + separator
    return this.messages.reduce((total, msg) => {
      return total + (msg.content?.split("\n").length ?? 1) + 2;
    }, 0);
  }

}
