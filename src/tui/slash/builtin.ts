/**
 * Built-in slash commands: /help, /clear, /quit.
 */
import type { SlashCommand, CommandContext } from "./registry.js";

export function createBuiltinCommands(
  getRegistry: () => { getAll: () => SlashCommand[] },
): SlashCommand[] {
  return [
    {
      name: "help",
      aliases: ["h", "?"],
      description: "Show available commands",
      async execute(_args: string, ctx: CommandContext) {
        const commands = getRegistry().getAll();
        const lines = ["Available commands:", ""];
        for (const cmd of commands) {
          const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
          const args = cmd.args ? ` ${cmd.args}` : "";
          lines.push(`  /${cmd.name}${args}${aliases} — ${cmd.description}`);
        }
        ctx.addMessage("system", lines.join("\n"));
      },
    },
    {
      name: "clear",
      description: "Clear the message history",
      async execute(_args: string, ctx: CommandContext) {
        ctx.addMessage("system", "Messages cleared.");
      },
    },
    {
      name: "quit",
      aliases: ["exit", "q"],
      description: "Exit the application",
      async execute(_args: string, ctx: CommandContext) {
        ctx.exit();
      },
    },
  ];
}
