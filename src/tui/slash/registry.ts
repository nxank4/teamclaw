/**
 * Slash command registry — register, lookup, and autocomplete commands.
 */

export interface CommandContext {
  /** Add a message to the messages component. */
  addMessage: (role: string, content: string) => void;
  /** Request the TUI to re-render. */
  requestRender: () => void;
  /** Access to the TUI stop function. */
  exit: () => void;
  /** Access to the TUI instance (for interactive views). */
  tui?: import("../core/tui.js").TUI;
}

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  args?: string;
  execute: (args: string, ctx: CommandContext) => Promise<void>;
  hidden?: boolean;
}

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
    for (const alias of command.aliases ?? []) {
      this.commands.set(alias, command);
    }
  }

  unregister(name: string): void {
    const cmd = this.commands.get(name);
    if (cmd) {
      this.commands.delete(cmd.name);
      for (const alias of cmd.aliases ?? []) {
        this.commands.delete(alias);
      }
    }
  }

  lookup(input: string): { command: SlashCommand; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;

    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const cmd = this.commands.get(name);
    return cmd ? { command: cmd, args } : null;
  }

  getSuggestions(partial: string): SlashCommand[] {
    const query = partial.toLowerCase();
    const seen = new Set<string>();
    const results: SlashCommand[] = [];

    for (const [, cmd] of this.commands) {
      if (seen.has(cmd.name)) continue;
      if (cmd.hidden) continue;
      if (cmd.name.startsWith(query) || (cmd.aliases?.some((a) => a.startsWith(query)) ?? false)) {
        results.push(cmd);
        seen.add(cmd.name);
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  getAll(): SlashCommand[] {
    const seen = new Set<string>();
    const results: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (seen.has(cmd.name)) continue;
      if (!cmd.hidden) {
        results.push(cmd);
        seen.add(cmd.name);
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }
}
