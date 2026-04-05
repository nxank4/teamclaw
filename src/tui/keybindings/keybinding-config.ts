/**
 * Keybinding configuration — loads user keybinding overrides from JSON.
 * Supports Claude Code style (context-based) and OpenCode style (simple action→key).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type KeybindingContext = "global" | "chat" | "palette" | "panel" | "permission" | "shell";

export interface ClaudeCodeBinding {
  context: KeybindingContext;
  bindings: Record<string, string | null>; // key → action, null = unbind
}

export interface KeybindingConfigFile {
  $schema?: string;
  bindings?: ClaudeCodeBinding[];
  leader?: string;
  [action: string]: unknown;
}

export interface LoadResult {
  bindings: Map<string, { action: string; context: KeybindingContext }>;
  leader?: string;
  warnings: string[];
}

const CONFIG_DIR = join(homedir(), ".openpawl");
const CONFIG_FILE = join(CONFIG_DIR, "keybindings.json");

/**
 * Load keybinding config from ~/.openpawl/keybindings.json.
 * Returns default empty result if file doesn't exist.
 */
export function loadKeybindingConfig(): LoadResult {
  const result: LoadResult = { bindings: new Map(), warnings: [] };

  if (!existsSync(CONFIG_FILE)) return result;

  let raw: string;
  try {
    raw = readFileSync(CONFIG_FILE, "utf-8");
  } catch {
    result.warnings.push("Could not read keybindings.json");
    return result;
  }

  let config: KeybindingConfigFile;
  try {
    config = JSON.parse(raw) as KeybindingConfigFile;
  } catch {
    result.warnings.push("Invalid JSON in keybindings.json");
    return result;
  }

  if (typeof config.leader === "string") {
    result.leader = config.leader;
  }

  // Claude Code style: context-based bindings
  if (Array.isArray(config.bindings)) {
    for (const group of config.bindings) {
      if (!group.context || !group.bindings) continue;
      for (const [key, action] of Object.entries(group.bindings)) {
        if (action === null) {
          // null = unbind
          result.bindings.set(key.toLowerCase(), { action: "__unbind__", context: group.context });
        } else if (typeof action === "string") {
          result.bindings.set(key.toLowerCase(), { action, context: group.context });
        } else {
          result.warnings.push(`Invalid binding value for "${key}"`);
        }
      }
    }
    return result;
  }

  // OpenCode style: simple action → key mapping
  for (const [key, value] of Object.entries(config)) {
    if (key === "$schema" || key === "leader" || key === "bindings") continue;
    if (typeof value === "string") {
      // key is the action name, value is the key binding
      result.bindings.set(value.toLowerCase(), { action: key, context: "global" });
    }
  }

  return result;
}

/**
 * Create the default keybindings.json with comments showing defaults.
 * Returns the path to the created file.
 */
export function createDefaultConfig(): string {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const defaults: KeybindingConfigFile = {
    $schema: "https://openpawl.dev/schemas/keybindings.json",
    bindings: [
      {
        context: "chat",
        bindings: {
          "shift+tab": "mode:cycle",
          "ctrl+g": "editor:external",
          "alt+t": "thinking:toggle",
          "alt+p": "model:picker",
          "ctrl+r": "history:search",
        },
      },
      {
        context: "global",
        bindings: {
          "ctrl+p": "palette:show",
          "escape": "abort:current",
        },
      },
    ],
    leader: "ctrl+x",
  };

  writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2) + "\n", "utf-8");
  return CONFIG_FILE;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
