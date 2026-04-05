/**
 * Combined autocomplete provider — /commands + @files + @agents.
 */
import type { AutocompleteProvider, AutocompleteSuggestion, CommandRegistry } from "../tui/index.js";
import type { PromptRouter } from "../router/prompt-router.js";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export function createAutocompleteProvider(
  registry: CommandRegistry,
  cwd: string,
  router?: PromptRouter,
): AutocompleteProvider {
  return {
    getSuggestions(input: string, cursorPos: number): AutocompleteSuggestion[] {
      const text = input.slice(0, cursorPos);

      // / prefix → slash commands
      if (text.startsWith("/")) {
        const partial = text.slice(1).split(" ")[0] ?? "";
        return registry.getSuggestions(partial).map((cmd) => ({
          label: `/${cmd.name}`,
          description: cmd.description,
          insertText: `/${cmd.name} `,
        }));
      }

      // @ anywhere → check agent mentions first, then file completion
      const atMatch = text.match(/@(\S*)$/);
      if (atMatch) {
        const partial = atMatch[1] ?? "";

        // Agent mentions (if router available)
        if (router) {
          const agentSuggestions = getAgentCompletions(partial, router);
          if (agentSuggestions.length > 0) return agentSuggestions;
        }

        // File completion fallback
        return getFileCompletions(partial, cwd);
      }

      return [];
    },
  };
}

function getAgentCompletions(partial: string, router: PromptRouter): AutocompleteSuggestion[] {
  const agents = router.getRegistry().getAll();
  const lower = partial.toLowerCase();

  return agents
    .filter((a) => a.id.toLowerCase().startsWith(lower) || a.name.toLowerCase().startsWith(lower))
    .slice(0, 8)
    .map((a) => ({
      label: `@${a.id}`,
      description: a.description.slice(0, 50),
      insertText: `@${a.id} `,
    }));
}

function getFileCompletions(partial: string, cwd: string): AutocompleteSuggestion[] {
  const dir = partial.includes("/")
    ? path.resolve(cwd, path.dirname(partial))
    : cwd;
  const prefix = partial.includes("/") ? path.basename(partial) : partial;

  try {
    const entries = readdirSync(dir)
      .filter((name) => !name.startsWith(".") && name !== "node_modules")
      .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 10);

    return entries.map((name) => {
      const fullPath = path.join(dir, name);
      const isDir = statSync(fullPath).isDirectory();
      const rel = partial.includes("/")
        ? path.dirname(partial) + "/" + name
        : name;
      return {
        label: `@${rel}${isDir ? "/" : ""}`,
        description: isDir ? "directory" : "",
        insertText: `@${rel}${isDir ? "/" : ""} `,
      };
    });
  } catch {
    return [];
  }
}
