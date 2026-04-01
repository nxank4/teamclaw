/**
 * Input parser — detect slash commands, shell commands, and file references.
 */

export type ParsedInput =
  | { type: "message"; text: string }
  | { type: "command"; name: string; args: string }
  | { type: "shell"; command: string }
  | { type: "file_ref"; path: string; text: string };

/**
 * Parse raw user input into a structured type.
 * - "/" prefix → slash command
 * - "!" prefix → shell command
 * - Contains @path → file reference
 * - Otherwise → plain message
 */
export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();

  if (trimmed.startsWith("/")) {
    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
    return { type: "command", name, args };
  }

  if (trimmed.startsWith("!")) {
    return { type: "shell", command: trimmed.slice(1).trim() };
  }

  // Check for @file references
  const fileMatch = trimmed.match(/@([\w./-]+)/);
  if (fileMatch) {
    return {
      type: "file_ref",
      path: fileMatch[1]!,
      text: trimmed.replace(fileMatch[0], "").trim(),
    };
  }

  return { type: "message", text: trimmed };
}
