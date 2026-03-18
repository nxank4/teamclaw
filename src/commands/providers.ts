import { getGlobalProviderManager } from "../providers/provider-factory.js";
import { readGlobalConfig, type ProviderConfigEntry } from "../core/global-config.js";
import { logger } from "../core/logger.js";
import pc from "picocolors";

const ENV_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  OPENROUTER_API_KEY: "openrouter",
  DEEPSEEK_API_KEY: "deepseek",
  GROQ_API_KEY: "groq",
};

export async function runProvidersCommand(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === "--help" || sub === "-h") {
    logger.plain("Usage: teamclaw providers <subcommand>");
    logger.plain("");
    logger.plain("Subcommands:");
    logger.plain("  list     Show configured providers and status");
    logger.plain("  test     Test each provider in the chain");
    return;
  }

  if (sub === "list") {
    await listProviders();
    return;
  }

  if (sub === "test") {
    await testProviders();
    return;
  }

  logger.error(`Unknown providers subcommand: ${sub}`);
  logger.error("Run `teamclaw providers --help` for usage.");
  process.exit(1);
}

async function listProviders(): Promise<void> {
  let configEntries: ProviderConfigEntry[] | undefined;
  try {
    const cfg = readGlobalConfig();
    configEntries = cfg?.providers;
  } catch {
    // Config unavailable
  }

  // Detect env-var providers
  const envProviders: { type: string; envVar: string }[] = [];
  for (const [envKey, type] of Object.entries(ENV_KEYS)) {
    if (process.env[envKey]) {
      envProviders.push({ type, envVar: envKey });
    }
  }

  logger.plain("Providers:");
  logger.plain("");

  if (configEntries && configEntries.length > 0) {
    logger.plain(pc.dim("  From config:"));
    configEntries.forEach((entry, i) => {
      const model = entry.model ? pc.dim(` (${entry.model})`) : "";
      logger.plain(`  ${i + 1}. ${pc.bold(entry.name ?? entry.type)}${model}  ${pc.green("configured")}`);
    });
  } else {
    logger.plain(pc.dim("  No providers in config file."));
  }

  if (envProviders.length > 0) {
    logger.plain("");
    logger.plain(pc.dim("  From environment:"));
    envProviders.forEach((ep) => {
      logger.plain(`     ${pc.bold(ep.type)}  ${pc.green("from env")} ${pc.dim(`(${ep.envVar})`)}`);
    });
  }

  if ((!configEntries || configEntries.length === 0) && envProviders.length === 0) {
    logger.plain("");
    logger.plain(pc.yellow("  No providers configured."));
    logger.plain(pc.dim("  Run `teamclaw setup` or set an API key env var (e.g. ANTHROPIC_API_KEY)."));
  }
}

async function testProviders(): Promise<void> {
  const manager = getGlobalProviderManager();
  const providers = manager.getProviders();

  if (providers.length === 0) {
    logger.plain(pc.yellow("No providers configured. Nothing to test."));
    logger.plain(pc.dim("Run `teamclaw setup` or set an API key env var (e.g. ANTHROPIC_API_KEY)."));
    return;
  }

  logger.plain("Testing providers...\n");

  let healthy = 0;
  for (const provider of providers) {
    const start = Date.now();
    let ok = false;
    try {
      ok = await provider.healthCheck();
    } catch {
      ok = false;
    }
    const latency = Date.now() - start;

    if (ok) {
      healthy++;
      logger.plain(`  ${pc.green("✓")} ${pc.bold(provider.name)}  connected (${latency}ms)`);
    } else {
      logger.plain(`  ${pc.red("✗")} ${pc.bold(provider.name)}  unreachable`);
    }
  }

  logger.plain("");
  logger.plain(`${healthy}/${providers.length} provider(s) healthy.`);

  if (providers.length > 1) {
    logger.plain("");
    logger.plain("Fallback order:");
    providers.forEach((p, i) => {
      logger.plain(`  ${i + 1}. ${p.name}`);
    });
  }
}
