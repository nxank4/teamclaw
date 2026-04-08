/**
 * Filters tool_call blocks, [Tool Result], and [TOOL_CALL] markers
 * from the LLM token stream before they reach the TUI display.
 *
 * Operates as a character-level state machine so it handles tokens
 * of any granularity (single chars, words, or multi-line chunks).
 */

type FilterState =
  | "passthrough"
  | "maybe_fence"
  | "fence_opened"
  | "suppressing_fence"
  | "buffering_json_fence"
  | "maybe_marker"
  | "suppressing_block";

const MARKER_MAX_BUFFER = 50;
const TOOL_CALL_OPEN = "[TOOL_CALL]";
const TOOL_CALL_CLOSE = "[/TOOL_CALL]";
const TOOL_RESULT_PREFIX = "[Tool Result";

export class ToolCallTokenFilter {
  private state: FilterState = "passthrough";
  private buffer = "";
  private backtickCount = 0;
  private closingBacktickCount = 0;
  /** For suppressing_block: tracks partial match of the closing tag */
  private closeTagBuffer = "";
  /** For buffering_json_fence: holds the full ```json block content */
  private jsonFenceBuffer = "";
  private readonly output: (text: string) => void;

  constructor(output: (text: string) => void) {
    this.output = output;
  }

  feed(token: string): void {
    for (let i = 0; i < token.length; i++) {
      this.processChar(token[i]!);
    }
  }

  flush(): void {
    if (this.buffer.length > 0 && this.state !== "suppressing_fence" && this.state !== "suppressing_block" && this.state !== "buffering_json_fence") {
      this.output(this.buffer);
    }
    if (this.state === "buffering_json_fence" && this.jsonFenceBuffer.length > 0) {
      // Incomplete JSON fence — output what we have (not a tool call)
      if (!looksLikeToolCallJson(this.jsonFenceBuffer.trim())) {
        this.output(this.buffer + this.jsonFenceBuffer);
      }
    }
    this.reset();
  }

  reset(): void {
    this.state = "passthrough";
    this.buffer = "";
    this.backtickCount = 0;
    this.closingBacktickCount = 0;
    this.closeTagBuffer = "";
    this.jsonFenceBuffer = "";
  }

  private processChar(ch: string): void {
    switch (this.state) {
      case "passthrough":
        return this.handlePassthrough(ch);
      case "maybe_fence":
        return this.handleMaybeFence(ch);
      case "fence_opened":
        return this.handleFenceOpened(ch);
      case "suppressing_fence":
        return this.handleSuppressingFence(ch);
      case "buffering_json_fence":
        return this.handleBufferingJsonFence(ch);
      case "maybe_marker":
        return this.handleMaybeMarker(ch);
      case "suppressing_block":
        return this.handleSuppressingBlock(ch);
    }
  }

  private handlePassthrough(ch: string): void {
    if (ch === "`") {
      this.buffer = ch;
      this.backtickCount = 1;
      this.state = "maybe_fence";
    } else if (ch === "[") {
      this.buffer = ch;
      this.state = "maybe_marker";
    } else {
      this.output(ch);
    }
  }

  private handleMaybeFence(ch: string): void {
    if (ch === "`") {
      this.buffer += ch;
      this.backtickCount++;
      if (this.backtickCount >= 3) {
        this.state = "fence_opened";
      }
    } else {
      // Not a fence — flush buffered backticks + this char
      this.output(this.buffer + ch);
      this.buffer = "";
      this.backtickCount = 0;
      this.state = "passthrough";
    }
  }

  private handleFenceOpened(ch: string): void {
    this.buffer += ch;
    if (ch === "\n") {
      // Info string complete — check if it's a tool_call fence
      const infoString = this.buffer.slice(3, -1).trim(); // strip ``` and trailing \n
      if (/^tool_call$/.test(infoString)) {
        // Suppress everything until closing ```
        this.buffer = "";
        this.closingBacktickCount = 0;
        this.state = "suppressing_fence";
      } else if (/^json$/.test(infoString)) {
        // JSON fence — buffer content to check if it's a tool call
        this.jsonFenceBuffer = "";
        this.closingBacktickCount = 0;
        this.state = "buffering_json_fence";
      } else {
        // Regular code fence — flush and pass through
        this.output(this.buffer);
        this.buffer = "";
        this.backtickCount = 0;
        this.state = "passthrough";
      }
    }
  }

  private handleSuppressingFence(ch: string): void {
    if (ch === "`") {
      this.closingBacktickCount++;
      if (this.closingBacktickCount >= 3) {
        this.closingBacktickCount = 0;
        this.state = "passthrough";
      }
    } else {
      this.closingBacktickCount = 0;
    }
  }

  /**
   * Buffer content inside a ```json fence. When we hit the closing ```,
   * check if the content looks like a tool call JSON (has "name" and "input"/"parameters").
   * If so, suppress. Otherwise, output the whole block.
   */
  private handleBufferingJsonFence(ch: string): void {
    if (ch === "`") {
      this.closingBacktickCount++;
      if (this.closingBacktickCount >= 3) {
        // Closing fence reached — check if content is a tool call
        const content = this.jsonFenceBuffer.trim();
        if (looksLikeToolCallJson(content)) {
          // Suppress — don't output anything
        } else {
          // Not a tool call — output the whole buffered block
          this.output(this.buffer + this.jsonFenceBuffer + "```");
        }
        this.buffer = "";
        this.jsonFenceBuffer = "";
        this.closingBacktickCount = 0;
        this.state = "passthrough";
      }
    } else {
      if (this.closingBacktickCount > 0) {
        // False alarm — the backticks weren't a closing fence
        this.jsonFenceBuffer += "`".repeat(this.closingBacktickCount) + ch;
        this.closingBacktickCount = 0;
      } else {
        this.jsonFenceBuffer += ch;
      }
    }
  }

  private handleMaybeMarker(ch: string): void {
    this.buffer += ch;

    // Check against known marker prefixes
    const matchesToolCallOpen = TOOL_CALL_OPEN.startsWith(this.buffer);
    const matchesToolCallClose = TOOL_CALL_CLOSE.startsWith(this.buffer);
    const matchesToolResult = TOOL_RESULT_PREFIX.startsWith(this.buffer) ||
      (this.buffer.length > TOOL_RESULT_PREFIX.length && this.buffer.startsWith(TOOL_RESULT_PREFIX));

    if (!matchesToolCallOpen && !matchesToolCallClose && !matchesToolResult) {
      // No match — flush buffer
      this.output(this.buffer);
      this.buffer = "";
      this.state = "passthrough";
      return;
    }

    if (this.buffer.length > MARKER_MAX_BUFFER) {
      // Buffer too long without completing a match — flush
      this.output(this.buffer);
      this.buffer = "";
      this.state = "passthrough";
      return;
    }

    // Check for complete matches
    if (this.buffer === TOOL_CALL_OPEN) {
      // Enter block suppression until [/TOOL_CALL]
      this.buffer = "";
      this.closeTagBuffer = "";
      this.state = "suppressing_block";
      return;
    }

    if (this.buffer === TOOL_CALL_CLOSE) {
      // Suppress the closing tag itself
      this.buffer = "";
      this.state = "passthrough";
      return;
    }

    // [Tool Result ...] — suppress until closing ]
    if (this.buffer.startsWith(TOOL_RESULT_PREFIX) && ch === "]") {
      this.buffer = "";
      this.state = "passthrough";
      return;
    }
  }

  private handleSuppressingBlock(ch: string): void {
    // Eat everything, but watch for [/TOOL_CALL]
    this.closeTagBuffer += ch;

    if (TOOL_CALL_CLOSE.startsWith(this.closeTagBuffer)) {
      if (this.closeTagBuffer === TOOL_CALL_CLOSE) {
        // Found closing tag — done suppressing
        this.closeTagBuffer = "";
        this.state = "passthrough";
      }
      // Partial match — keep accumulating
    } else {
      // Not matching — reset close tag tracking
      this.closeTagBuffer = "";
      // Re-check current char in case it starts a new [
      if (ch === "[") {
        this.closeTagBuffer = ch;
      }
    }
  }
}

/**
 * Check if a JSON string looks like a tool call payload.
 * Matches: {"name": "...", "input": {...}} or {"name": "...", "parameters": {...}}
 */
function looksLikeToolCallJson(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.name === "string" &&
      parsed.name.length > 0 &&
      (typeof parsed.input === "object" || typeof parsed.parameters === "object" || typeof parsed.arguments === "object")
    );
  } catch {
    return false;
  }
}
