/**
 * CLI commands for managing custom agents.
 *
 * Usage:
 *   openpawl agent add <source>      Register from file/dir/npm
 *   openpawl agent list               List registered agents
 *   openpawl agent show <role>        Show agent details
 *   openpawl agent remove <role>      Remove a registered agent
 *   openpawl agent validate <file>    Validate without registering
 */

import { logger } from "../core/logger.js";
import { AgentRegistryStore, loadAgentFromFile, loadAgentsFromDirectory, validateAgentDefinition } from "../agents/registry/index.js";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";

export async function runAgentCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    printHelp();
    return;
  }

  if (sub === "add") {
    await runAgentAdd(args.slice(1));
  } else if (sub === "list" || sub === "ls") {
    runAgentList();
  } else if (sub === "show") {
    await runAgentShow(args.slice(1));
  } else if (sub === "remove" || sub === "rm") {
    runAgentRemove(args.slice(1));
  } else if (sub === "validate") {
    await runAgentValidate(args.slice(1));
  } else {
    logger.error(`Unknown subcommand: agent ${sub}`);
    printHelp();
    process.exit(1);
  }
}

function printHelp(): void {
  const lines = [
    "",
    pc.bold("openpawl agent") + " — Manage custom agents",
    "",
    "  " + pc.green("add <source>") + "      Register agent from file, directory, or npm package",
    "  " + pc.green("list") + "              List all registered custom agents",
    "  " + pc.green("show <role>") + "       Show details for a specific agent",
    "  " + pc.green("remove <role>") + "     Remove a registered agent",
    "  " + pc.green("validate <file>") + "   Validate an agent definition (no registration)",
    "",
    "Examples:",
    pc.dim("  openpawl agent add ./my-agent.ts"),
    pc.dim("  openpawl agent add ./agents/"),
    pc.dim("  openpawl agent list"),
    pc.dim("  openpawl agent remove code-reviewer"),
    "",
  ];
  console.log(lines.join("\n"));
}

async function runAgentAdd(args: string[]): Promise<void> {
  const source = args[0];
  if (!source) {
    logger.error("Usage: openpawl agent add <source>");
    process.exit(1);
  }

  const absSource = path.resolve(source);
  if (!existsSync(absSource)) {
    // Try as npm package
    logger.error(`Source not found: ${absSource}`);
    logger.error("For npm packages, use: openpawl agent add npm:<package-name>");
    process.exit(1);
  }

  const store = new AgentRegistryStore();
  const isDir = statSync(absSource).isDirectory();

  try {
    const defs = isDir
      ? await loadAgentsFromDirectory(absSource)
      : await loadAgentFromFile(absSource);

    if (defs.length === 0) {
      logger.error("No valid agent definitions found.");
      process.exit(1);
    }

    for (const def of defs) {
      const entry = await store.register(def, isDir ? path.join(absSource, `${def.role}.ts`) : absSource);
      logger.success(`Registered agent: ${pc.bold(entry.displayName)} (${entry.role})`);
    }

    logger.success(`${defs.length} agent(s) registered successfully.`);
  } catch (err) {
    logger.error(`Failed to add agent: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function runAgentList(): void {
  const store = new AgentRegistryStore();
  const agents = store.list();

  if (agents.length === 0) {
    logger.plain("No custom agents registered.");
    logger.plain(pc.dim("Register one with: openpawl agent add <file>"));
    return;
  }

  const header = `${pc.bold("Role")}${" ".repeat(24)}${pc.bold("Name")}${" ".repeat(20)}${pc.bold("Source")}`;
  logger.plain(header);
  logger.plain("─".repeat(80));

  for (const agent of agents) {
    const role = agent.role.padEnd(28);
    const name = agent.displayName.padEnd(24);
    const source = pc.dim(path.basename(agent.source));
    logger.plain(`${role}${name}${source}`);
  }
}

async function runAgentShow(args: string[]): Promise<void> {
  const role = args[0];
  if (!role) {
    logger.error("Usage: openpawl agent show <role>");
    process.exit(1);
  }

  const store = new AgentRegistryStore();
  const agent = store.get(role);
  if (!agent) {
    logger.error(`Agent not found: ${role}`);
    process.exit(1);
  }

  // Load full definition
  const defs = store.loadAllSync().filter((d) => d.role === role);
  const def = defs[0];

  logger.plain("");
  logger.plain(pc.bold(`${agent.displayName} (${agent.role})`));
  logger.plain("─".repeat(50));
  logger.plain(`Description:  ${def?.description ?? agent.description}`);
  logger.plain(`Task Types:   ${def?.taskTypes?.join(", ") ?? "—"}`);
  logger.plain(`Source:       ${agent.source}`);
  logger.plain(`Registered:   ${agent.registeredAt}`);

  if (def?.compositionRules) {
    logger.plain("");
    logger.plain(pc.bold("Composition Rules:"));
    if (def.compositionRules.includeKeywords?.length) {
      logger.plain(`  Include keywords: ${def.compositionRules.includeKeywords.join(", ")}`);
    }
    if (def.compositionRules.excludeKeywords?.length) {
      logger.plain(`  Exclude keywords: ${def.compositionRules.excludeKeywords.join(", ")}`);
    }
    if (def.compositionRules.required) {
      logger.plain("  Required: yes");
    }
  }

  if (def?.confidenceConfig) {
    logger.plain("");
    logger.plain(pc.bold("Confidence Config:"));
    if (def.confidenceConfig.minConfidence != null) {
      logger.plain(`  Min confidence: ${def.confidenceConfig.minConfidence}`);
    }
    if (def.confidenceConfig.flags?.length) {
      logger.plain(`  Custom flags: ${def.confidenceConfig.flags.join(", ")}`);
    }
  }

  logger.plain("");
}

function runAgentRemove(args: string[]): void {
  const role = args[0];
  if (!role) {
    logger.error("Usage: openpawl agent remove <role>");
    process.exit(1);
  }

  const store = new AgentRegistryStore();
  const removed = store.unregister(role);
  if (removed) {
    logger.success(`Removed agent: ${role}`);
  } else {
    logger.error(`Agent not found: ${role}`);
    process.exit(1);
  }
}

async function runAgentValidate(args: string[]): Promise<void> {
  const filePath = args[0];
  if (!filePath) {
    logger.error("Usage: openpawl agent validate <file>");
    process.exit(1);
  }

  try {
    const defs = await loadAgentFromFile(filePath);
    for (const def of defs) {
      const result = validateAgentDefinition(def);
      if (result.success) {
        logger.success(`${pc.bold(def.role)} — valid`);
      } else {
        logger.error(`${pc.bold(def.role)} — invalid:`);
        for (const err of result.errors ?? []) {
          logger.error(`  ${err}`);
        }
      }
    }
  } catch (err) {
    logger.error(`Validation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
