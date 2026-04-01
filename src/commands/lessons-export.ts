/**
 * Export lessons and success patterns from VectorMemory.
 */

import { VectorMemory } from "../core/knowledge-base.js";
import { CONFIG } from "../core/config.js";
import { logger } from "../core/logger.js";
import { loadTeamConfig } from "../core/team-config.js";
import { SuccessPatternStore } from "../memory/success/store.js";
import { PatternQualityStore } from "../memory/success/quality.js";
import { GlobalMemoryManager } from "../memory/global/store.js";
import { PromotionEngine } from "../memory/global/promoter.js";

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : undefined;
}

export async function runLessonsExport(args: string[]): Promise<void> {
  const subCmd = args[0];

  // Handle promote/demote subcommands
  if (subCmd === "promote" || subCmd === "demote") {
    const patternId = args[1];
    if (!patternId) {
      logger.error(`Usage: openpawl lessons ${subCmd} <pattern-id>`);
      process.exit(1);
    }

    const teamConfig = await loadTeamConfig();
    const vectorMemory = new VectorMemory(
      CONFIG.vectorStorePath,
      teamConfig?.memory_backend ?? CONFIG.memoryBackend,
    );
    await vectorMemory.init();
    const db = vectorMemory.getDb();
    const embedder = vectorMemory.getEmbedder();
    if (!db || !embedder) {
      logger.error("LanceDB not available");
      process.exit(1);
    }

    const globalManager = new GlobalMemoryManager();
    await globalManager.init(embedder);

    if (subCmd === "promote") {
      const sessionStore = new SuccessPatternStore(db, embedder);
      await sessionStore.init();
      const qualityStore = new PatternQualityStore(db);
      await qualityStore.init();
      const promoter = new PromotionEngine(globalManager, sessionStore, qualityStore, embedder);
      const ok = await promoter.promoteById(patternId);
      if (ok) {
        logger.success(`Promoted pattern ${patternId} to global memory`);
      } else {
        logger.error(`Failed to promote pattern ${patternId} (not found or store unavailable)`);
        process.exit(1);
      }
    } else {
      const promoter = new PromotionEngine(
        globalManager,
        { getAll: async () => [] } as never,
        { getQuality: async () => null } as never,
        embedder,
      );
      const ok = await promoter.demoteById(patternId);
      if (ok) {
        logger.success(`Demoted pattern ${patternId} from global memory`);
      } else {
        logger.error(`Failed to demote pattern ${patternId}`);
        process.exit(1);
      }
    }
    return;
  }

  const format = getArgValue(args, "--format") ?? "markdown";
  const type = getArgValue(args, "--type") ?? "failures";

  const teamConfig = await loadTeamConfig();
  const vectorMemory = new VectorMemory(
    CONFIG.vectorStorePath,
    teamConfig?.memory_backend ?? CONFIG.memoryBackend
  );
  await vectorMemory.init();

  const showFailures = type === "failures" || type === "all";
  const showSuccesses = type === "successes" || type === "all";

  if (format === "json") {
    const result: Record<string, unknown> = {};

    if (showFailures) {
      result.lessons = await vectorMemory.getCumulativeLessons();
    }

    if (showSuccesses) {
      const db = vectorMemory.getDb();
      const embedder = vectorMemory.getEmbedder();
      if (db && embedder) {
        const store = new SuccessPatternStore(db, embedder);
        await store.init();
        result.successPatterns = await store.getAll();
      } else {
        result.successPatterns = [];
      }
    }

    logger.plain(JSON.stringify(result, null, 2));
    return;
  }

  // Markdown format
  const lines: string[] = [];

  if (showFailures) {
    const lessons = await vectorMemory.getCumulativeLessons();
    lines.push(
      "# OpenPawl — Standard Operating Procedures",
      "",
      "Lessons learned from prior work sessions. Use these to improve future runs.",
      "",
      "## Lessons",
      "",
      ...lessons.map((l, i) => `${i + 1}. ${l}`),
    );
  }

  if (showSuccesses) {
    const db = vectorMemory.getDb();
    const embedder = vectorMemory.getEmbedder();
    if (db && embedder) {
      const store = new SuccessPatternStore(db, embedder);
      await store.init();
      const patterns = await store.getAll();

      if (lines.length > 0) lines.push("", "---", "");

      lines.push("## Success Patterns", "");
      if (patterns.length === 0) {
        lines.push("_(no success patterns stored yet)_");
      } else {
        for (let i = 0; i < patterns.length; i++) {
          const p = patterns[i];
          const conf = Math.round(p.confidence * 100);
          lines.push(
            `${i + 1}. **Task:** "${p.taskDescription}" | Confidence: ${conf}% | Rework: ${p.reworkCount}`,
            `   **Approach:** ${p.approach.slice(0, 200)}`,
            `   **Tags:** ${p.tags.join(", ") || "none"}`,
            "",
          );
        }
      }
    } else {
      if (lines.length > 0) lines.push("", "---", "");
      lines.push("## Success Patterns", "", "_(LanceDB not available)_");
    }
  }

  lines.push("", "---", `*Exported ${new Date().toISOString()}*`);
  logger.plain(lines.join("\n"));
}
