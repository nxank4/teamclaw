/**
 * TeamClaw check — verify LLM provider connectivity.
 */

import { getGlobalProviderManager } from "./providers/provider-factory.js";
import { logger } from "./core/logger.js";
import { intro, log, note, outro, spinner } from "@clack/prompts";
import { randomPhrase } from "./utils/spinner-phrases.js";

export async function runCheck(_args: string[]): Promise<void> {
  const canRenderSpinner = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  if (canRenderSpinner) {
    intro("TeamClaw Provider Check");
  } else {
    logger.plain("TeamClaw provider check\n");
  }

  const manager = getGlobalProviderManager();
  const providers = manager.getProviders();

  if (providers.length === 0) {
    if (canRenderSpinner) {
      log.error(
        "No LLM providers configured. Run `teamclaw setup` or set an API key env var (e.g. ANTHROPIC_API_KEY).",
      );
      outro("Provider check failed.");
    } else {
      logger.error(
        "No LLM providers configured. Run `teamclaw setup` or set an API key env var (e.g. ANTHROPIC_API_KEY).",
      );
    }
    process.exit(1);
  }

  const s = canRenderSpinner ? spinner() : null;
  if (s) s.start(randomPhrase("network"));

  let healthy = 0;
  const results: { name: string; ok: boolean; latency: number }[] = [];

  for (const provider of providers) {
    const start = Date.now();
    let ok = false;
    try {
      ok = await provider.healthCheck();
    } catch {
      ok = false;
    }
    const latency = Date.now() - start;
    results.push({ name: provider.name, ok, latency });

    if (ok) {
      healthy++;
      if (s) {
        s.message(`✅ ${provider.name} healthy (${latency}ms)`);
      } else {
        logger.success(`${provider.name} healthy (${latency}ms)`);
      }
    } else {
      if (s) {
        s.message(`❌ ${provider.name} unreachable`);
      } else {
        logger.error(`${provider.name} unreachable`);
      }
    }
  }

  if (s) {
    s.stop(`${healthy}/${providers.length} provider(s) healthy.`);
  }

  // Summary
  const summaryLines = results.map(
    (r) => `  ${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? ` (${r.latency}ms)` : ""}`,
  );
  summaryLines.push("");
  summaryLines.push("Fallback order:");
  providers.forEach((p, i) => {
    summaryLines.push(`  ${i + 1}. ${p.name}`);
  });

  if (canRenderSpinner) {
    note(summaryLines.join("\n"), `${healthy}/${providers.length} provider(s) healthy`);
    outro(healthy === providers.length ? "Provider check complete." : "Provider check failed.");
  } else {
    logger.plain("");
    logger.plain(`${healthy}/${providers.length} provider(s) healthy`);
    for (const line of summaryLines) {
      logger.plain(line);
    }
  }

  if (healthy === 0) {
    process.exit(1);
  }
}
