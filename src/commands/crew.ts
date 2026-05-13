/**
 * CLI command: openpawl crew
 * Manage built-in and user-authored crew presets.
 *
 * The runtime resolves crews via `loadUserCrew(name)`, which checks
 * `~/.openpawl/crews/<name>/` first and falls back to the bundled
 * preset. These CLI subcommands manipulate the user-side directory
 * (clone / create / edit / delete) and read both surfaces (list /
 * show / validate). Built-ins are never mutated on disk.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

import { isCancel, confirm, text as promptText } from "@clack/prompts";
import YAML from "yaml";

import { logger } from "../core/logger.js";
import {
  AGENT_ID_PATTERN,
  BUILT_IN_PRESETS,
  FULL_STACK_PRESET,
  MANIFEST_FILENAME,
  builtInPresetDir,
  builtInPresetExists,
  listUserCrewNames,
  loadManifestFromDir,
  userCrewDir,
  userCrewsDir,
  validateManifest,
} from "../crew/manifest/index.js";
import type { CrewManifest } from "../crew/manifest/index.js";
import type { CrewRunResult, RunCrewArgs } from "../crew/crew-runner.js";

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runCrewCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    printHelp();
    return;
  }

  switch (sub) {
    case "list":
      listCrews();
      return;
    case "show":
      showCrew(args[1]);
      return;
    case "create":
      await createCrew(args[1]);
      return;
    case "edit":
      await editCrew(args[1]);
      return;
    case "delete":
      await deleteCrew(args[1]);
      return;
    case "validate":
      validateCrew(args[1]);
      return;
    case "clone":
      cloneCrew(args[1], args[2]);
      return;
    case "run":
      await runCrewPreset(args[1], args.slice(2));
      return;
    default:
      logger.error(`Unknown subcommand: ${sub}`);
      logger.plain('Run "openpawl crew --help" for usage.');
      process.exitCode = 1;
  }
}

function printHelp(): void {
  logger.plain("Usage: openpawl crew <subcommand>\n");
  logger.plain("Subcommands:");
  logger.plain("  list                       List all crews (built-in + user)");
  logger.plain("  show <name>                Print manifest YAML and agent prompts");
  logger.plain("  create <name>              Interactive prompt to create a new crew");
  logger.plain("  edit <name>                Open the manifest in $EDITOR");
  logger.plain("  delete <name>              Remove a user crew (built-ins are protected)");
  logger.plain("  validate <name>            Validate a crew manifest");
  logger.plain("  clone <built-in> <new>     Fork a built-in preset into ~/.openpawl/crews/<new>");
  logger.plain("  run <name> <goal>          Start a crew run with the named preset");
  logger.plain("");
  logger.plain("Built-in presets: " + BUILT_IN_PRESETS.join(", "));
}

// ─── list ────────────────────────────────────────────────────────────────────

interface CrewSummary {
  name: string;
  source: "built-in" | "user";
  agents: string[];
  description: string;
}

export function collectCrews(homeDir: string = os.homedir()): CrewSummary[] {
  const summaries: CrewSummary[] = [];
  const userNames = new Set(listUserCrewNames(homeDir));

  // User crews first so their names "shadow" built-ins of the same id.
  for (const name of [...userNames].sort()) {
    const summary = readSummary(name, "user", userCrewDir(name, homeDir));
    if (summary) summaries.push(summary);
  }
  for (const name of BUILT_IN_PRESETS) {
    if (userNames.has(name)) continue; // already listed under user
    if (!builtInPresetExists(name)) continue;
    const summary = readSummary(name, "built-in", builtInPresetDir(name));
    if (summary) summaries.push(summary);
  }
  return summaries;
}

function readSummary(name: string, source: "built-in" | "user", dir: string): CrewSummary | null {
  try {
    const manifest = loadManifestFromDir(dir, { skipModelResolution: true });
    return {
      name,
      source,
      description: manifest.description,
      agents: manifest.agents.map((a) => a.name),
    };
  } catch {
    // Skip unreadable / malformed entries from the listing — `validate`
    // surfaces the error explicitly when the user asks.
    return { name, source, description: "(invalid manifest)", agents: [] };
  }
}

function listCrews(): void {
  const crews = collectCrews();
  if (crews.length === 0) {
    logger.plain("No crews found.");
    return;
  }

  const nameWidth = Math.max(8, ...crews.map((c) => c.name.length));
  const sourceWidth = 12;

  logger.plain("Crews:");
  for (const c of crews) {
    const sourceLabel = `(${c.source})`.padEnd(sourceWidth);
    const namePadded = c.name.padEnd(nameWidth);
    const agents = c.agents.length > 0 ? c.agents.join(", ") : "(no agents)";
    logger.plain(`  ${namePadded}  ${sourceLabel}${agents}`);
  }
}

// ─── show ────────────────────────────────────────────────────────────────────

function showCrew(name: string | undefined): void {
  if (!name) {
    logger.error("Usage: openpawl crew show <name>");
    process.exitCode = 1;
    return;
  }

  const dir = resolveCrewDir(name);
  if (!dir) {
    logger.error(`No crew named '${name}'. Run \`openpawl crew list\` to see available crews.`);
    process.exitCode = 1;
    return;
  }

  const manifestPath = path.join(dir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    logger.error(`manifest.yaml not found at ${manifestPath}`);
    process.exitCode = 1;
    return;
  }

  logger.plain(`# ${manifestPath}`);
  logger.plain(readFileSync(manifestPath, "utf-8").trimEnd());

  // Read each prompt file referenced by the manifest. We use the
  // skip-resolution loader so this works even when no active model is
  // configured (a fresh install can still inspect built-in presets).
  let manifest: CrewManifest;
  try {
    manifest = loadManifestFromDir(dir, { skipModelResolution: true });
  } catch (err) {
    logger.error(`Failed to load manifest: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  for (const agent of manifest.agents) {
    logger.plain("");
    logger.plain(`# agent: ${agent.id} (${agent.name})`);
    logger.plain(agent.prompt.trimEnd());
  }
}

// ─── create ──────────────────────────────────────────────────────────────────

async function createCrew(nameArg: string | undefined): Promise<void> {
  const canPrompt = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  if (!canPrompt) {
    logger.error("openpawl crew create requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }

  let name = nameArg;
  if (!name) {
    const answer = await promptText({
      message: "Crew name (lowercase letters, digits, dashes):",
      validate: (v) => (AGENT_ID_PATTERN.test(v ?? "") ? undefined : "Use lowercase letters, digits, and dashes only."),
    });
    if (isCancel(answer)) {
      logger.plain("Cancelled.");
      return;
    }
    name = String(answer);
  }

  if (!AGENT_ID_PATTERN.test(name)) {
    logger.error(`Invalid name '${name}'. Use lowercase letters, digits, and dashes only.`);
    process.exitCode = 1;
    return;
  }

  const dir = userCrewDir(name);
  if (existsSync(dir)) {
    logger.error(`Crew '${name}' already exists at ${dir}.`);
    process.exitCode = 1;
    return;
  }

  const description = await promptText({
    message: "One-line description:",
    validate: (v) => ((v ?? "").trim().length > 0 ? undefined : "Description cannot be empty."),
  });
  if (isCancel(description)) {
    logger.plain("Cancelled.");
    return;
  }

  const agentIdsRaw = await promptText({
    message: "Agent ids (comma-separated, minimum 2):",
    placeholder: "planner, coder",
    validate: (v) => {
      const ids = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length < 2) return "At least 2 agents are required.";
      for (const id of ids) {
        if (!AGENT_ID_PATTERN.test(id)) return `Invalid id '${id}'. Use lowercase letters, digits, and dashes.`;
      }
      return undefined;
    },
  });
  if (isCancel(agentIdsRaw)) {
    logger.plain("Cancelled.");
    return;
  }

  const agentIds = String(agentIdsRaw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  scaffoldCrew(dir, {
    name,
    description: String(description).trim(),
    agentIds,
  });

  logger.success(`Created crew '${name}' at ${dir}`);
  logger.plain(`Edit prompts in ${dir} or run \`openpawl crew edit ${name}\`.`);
}

interface ScaffoldInput {
  name: string;
  description: string;
  agentIds: string[];
}

function scaffoldCrew(dir: string, input: ScaffoldInput): void {
  mkdirSync(dir, { recursive: true });

  const agents = input.agentIds.map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    description: `${id} agent`,
    tools: ["file_read", "file_list"],
    prompt_file: `${id}.md`,
  }));

  const manifest = {
    name: input.name,
    description: input.description,
    version: "1.0.0",
    constraints: {
      min_agents: 2,
      max_agents: 10,
      recommended_range: [2, agents.length],
      required_roles: [] as string[],
    },
    agents,
  };

  writeFileSync(path.join(dir, MANIFEST_FILENAME), YAML.stringify(manifest), "utf-8");
  for (const a of agents) {
    const promptPath = path.join(dir, a.prompt_file);
    const stub = `# ${a.name}\n\nYou are ${a.name}, an agent on the ${input.name} crew.\nDescribe this agent's role here. Keep prompts focused.\n`;
    writeFileSync(promptPath, stub, "utf-8");
  }
}

// ─── edit ────────────────────────────────────────────────────────────────────

async function editCrew(name: string | undefined): Promise<void> {
  if (!name) {
    logger.error("Usage: openpawl crew edit <name>");
    process.exitCode = 1;
    return;
  }

  const dir = userCrewDir(name);
  const manifestPath = path.join(dir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    if (BUILT_IN_PRESETS.includes(name as typeof BUILT_IN_PRESETS[number])) {
      logger.error(`'${name}' is a built-in preset and cannot be edited in place.`);
      logger.plain(`Run \`openpawl crew clone ${name} my-${name}\` to fork it.`);
    } else {
      logger.error(`No user crew named '${name}'.`);
    }
    process.exitCode = 1;
    return;
  }

  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "nano";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor, [manifestPath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${editor} exited with code ${code}`));
    });
  });
}

// ─── delete ──────────────────────────────────────────────────────────────────

async function deleteCrew(name: string | undefined): Promise<void> {
  if (!name) {
    logger.error("Usage: openpawl crew delete <name>");
    process.exitCode = 1;
    return;
  }

  const dir = userCrewDir(name);
  if (!existsSync(dir)) {
    if (BUILT_IN_PRESETS.includes(name as typeof BUILT_IN_PRESETS[number])) {
      logger.error(`'${name}' is a built-in preset; built-ins are protected from deletion.`);
    } else {
      logger.error(`No user crew named '${name}' to delete.`);
    }
    process.exitCode = 1;
    return;
  }

  const canPrompt = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  if (canPrompt) {
    const confirmed = await confirm({
      message: `Permanently delete crew '${name}' at ${dir}?`,
    });
    if (isCancel(confirmed) || !confirmed) {
      logger.plain("Cancelled.");
      return;
    }
  }

  rmSync(dir, { recursive: true, force: true });
  logger.success(`Deleted crew '${name}'.`);
}

// ─── validate ────────────────────────────────────────────────────────────────

function validateCrew(name: string | undefined): void {
  if (!name) {
    logger.error("Usage: openpawl crew validate <name>");
    process.exitCode = 1;
    return;
  }

  const dir = resolveCrewDir(name);
  if (!dir) {
    logger.error(`No crew named '${name}'.`);
    process.exitCode = 1;
    return;
  }

  let manifest: CrewManifest;
  try {
    manifest = loadManifestFromDir(dir, { skipModelResolution: true });
  } catch (err) {
    logger.error(`Failed to parse manifest: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const result = validateManifest(manifest);
  if (result.errors.length === 0 && result.warnings.length === 0) {
    logger.success(`✓ ${name} is valid.`);
    return;
  }
  for (const issue of result.errors) {
    logger.error(`error: ${issue.message}`);
  }
  for (const issue of result.warnings) {
    logger.warn(`warn:  ${issue.message}`);
  }
  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

// ─── run ─────────────────────────────────────────────────────────────────────

/**
 * Start a crew run with the named preset. Reuses `runCrewHeadless` so
 * the behavior matches `openpawl -p "<goal>" --mode crew --crew <name>`
 * exactly — this is the ergonomic surface for the same operation.
 *
 * The optional `runCrewImpl` parameter is a test seam forwarded through
 * to `runCrewHeadless`. Production callers should leave it undefined.
 */
async function runCrewPreset(
  name: string | undefined,
  goalArgs: string[],
  runCrewImpl?: (args: RunCrewArgs) => Promise<CrewRunResult>,
): Promise<void> {
  if (!name) {
    logger.error("Usage: openpawl crew run <name> <goal>");
    process.exitCode = 1;
    return;
  }
  const goal = goalArgs.join(" ").trim();
  if (!goal) {
    logger.error("Usage: openpawl crew run <name> <goal>");
    process.exitCode = 1;
    return;
  }

  // Fail-fast preset validation — same UX as `crew validate`.
  if (!resolveCrewDir(name)) {
    const available = collectCrews().map((c) => c.name).join(", ") || "(none)";
    logger.error(`No crew named '${name}'. Available: ${available}`);
    process.exitCode = 1;
    return;
  }

  const { runCrewHeadless } = await import("../app/run-crew-headless.js");
  const result = await runCrewHeadless({
    goal,
    crewName: name,
    workdir: process.cwd(),
    runCrewImpl,
  });
  process.exitCode = result.exitCode;
}

// ─── clone ───────────────────────────────────────────────────────────────────

export function cloneCrew(
  source: string | undefined,
  target: string | undefined,
  homeDir: string = os.homedir(),
): void {
  if (!source || !target) {
    logger.error("Usage: openpawl crew clone <built-in> <new-name>");
    process.exitCode = 1;
    return;
  }
  if (!AGENT_ID_PATTERN.test(target)) {
    logger.error(`Invalid target name '${target}'. Use lowercase letters, digits, and dashes.`);
    process.exitCode = 1;
    return;
  }

  const sourceDir = builtInPresetDir(source);
  if (!builtInPresetExists(source)) {
    logger.error(`'${source}' is not a built-in preset. Available: ${BUILT_IN_PRESETS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const targetDir = userCrewDir(target, homeDir);
  if (existsSync(targetDir)) {
    logger.error(`Target crew '${target}' already exists at ${targetDir}.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(userCrewsDir(homeDir), { recursive: true });
  copyDirRecursive(sourceDir, targetDir);

  // Rename the manifest's `name` field to the new crew name so the
  // clone is loadable as `<target>` rather than the built-in's id.
  const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
  if (existsSync(manifestPath)) {
    const raw = YAML.parse(readFileSync(manifestPath, "utf-8")) as { name?: string };
    if (raw && typeof raw === "object") {
      raw.name = target;
      writeFileSync(manifestPath, YAML.stringify(raw), "utf-8");
    }
  }

  logger.success(`Cloned '${source}' → '${target}' at ${targetDir}`);
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function resolveCrewDir(name: string): string | null {
  const userDir = userCrewDir(name);
  if (existsSync(path.join(userDir, MANIFEST_FILENAME))) return userDir;
  if (BUILT_IN_PRESETS.includes(name as typeof BUILT_IN_PRESETS[number]) && builtInPresetExists(name)) {
    return builtInPresetDir(name);
  }
  return null;
}

// Test seam — exported so unit tests can call helpers without going
// through process.argv parsing.
export const _testing = {
  collectCrews,
  resolveCrewDir,
  runCrewPreset,
  scaffoldCrew,
  FULL_STACK_PRESET,
};
