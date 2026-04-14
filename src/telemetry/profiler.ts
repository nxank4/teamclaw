/**
 * Lightweight performance profiler — opt-in via OPENPAWL_PROFILE=true.
 * Records timing data for pipeline stages, outputs summary table + timeline.
 * Zero overhead when disabled (all methods are no-ops).
 */

export type ProfileCategory =
  | "llm_call_ttfc"
  | "llm_call_total"
  | "memory_retrieval"
  | "memory_write"
  | "graph_node"
  | "streaming_chunk"
  | "sse_broadcast"
  | "tool_execution"
  | "total_pipeline"
  | "context_compression"
  | "sprint_planning"
  | "sprint_task";

export interface ProfileEntry {
  category: ProfileCategory;
  label: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  meta?: Record<string, unknown>;
}

const _enabled = !!process.env.OPENPAWL_PROFILE;
const _entries: ProfileEntry[] = [];
const _startRef = Date.now();

/** Check if profiling is enabled. */
export function isProfilingEnabled(): boolean {
  return _enabled;
}

/** Start a measurement span. Returns a finish callback. */
export function profileStart(
  category: ProfileCategory,
  label: string,
  meta?: Record<string, unknown>,
): () => void {
  if (!_enabled) return () => {};
  const startMs = Date.now() - _startRef;
  return () => {
    const endMs = Date.now() - _startRef;
    _entries.push({
      category,
      label,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      meta,
    });
  };
}

/**
 * Wrap an async function with profiling measurement.
 * Returns the function's result unchanged.
 */
export async function profileMeasure<T>(
  category: ProfileCategory,
  label: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  if (!_enabled) return fn();
  const finish = profileStart(category, label, meta);
  try {
    return await fn();
  } finally {
    finish();
  }
}

/** Get all recorded entries. */
export function getProfileEntries(): readonly ProfileEntry[] {
  return _entries;
}

/** Clear all recorded entries. */
export function clearProfileEntries(): void {
  _entries.length = 0;
}

// ── Report generation ──────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

interface CategoryStats {
  category: string;
  count: number;
  avg: number;
  p95: number;
  total: number;
}

function computeStats(): CategoryStats[] {
  const grouped = new Map<string, number[]>();
  for (const e of _entries) {
    const durations = grouped.get(e.category) ?? [];
    durations.push(e.durationMs);
    grouped.set(e.category, durations);
  }

  const stats: CategoryStats[] = [];
  for (const [category, durations] of grouped) {
    const total = durations.reduce((a, b) => a + b, 0);
    stats.push({
      category,
      count: durations.length,
      avg: total / durations.length,
      p95: percentile(durations, 95),
      total,
    });
  }

  // Sort by total descending
  stats.sort((a, b) => b.total - a.total);
  return stats;
}

function renderTable(stats: CategoryStats[]): string {
  const header = ["Category", "Count", "Avg", "P95", "Total"];
  const rows = stats.map((s) => [
    s.category,
    String(s.count),
    formatMs(s.avg),
    formatMs(s.p95),
    formatMs(s.total),
  ]);

  // Column widths
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  );

  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const fmtRow = (cells: string[]) =>
    "| " + cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ") + " |";

  return [sep, fmtRow(header), sep, ...rows.map(fmtRow), sep].join("\n");
}

function renderTimeline(): string {
  if (_entries.length === 0) return "(no entries)";

  // Show entries in chronological order
  const sorted = [..._entries].sort((a, b) => a.startMs - b.startMs);
  const maxDuration = Math.max(...sorted.map((e) => e.durationMs), 1);
  const BAR_WIDTH = 40;

  const lines: string[] = [];
  for (const e of sorted) {
    const barLen = Math.max(1, Math.round((e.durationMs / maxDuration) * BAR_WIDTH));
    const bar = "█".repeat(barLen);
    const label = `${e.label}`.padEnd(25);
    const duration = formatMs(e.durationMs).padStart(8);
    lines.push(`  ${label} ${bar} ${duration}`);
  }

  // Check for parallel execution (overlapping time ranges)
  const parallelGroups: ProfileEntry[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const group = [a];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.startMs < a.endMs && b.endMs > a.startMs) {
        group.push(b);
      }
    }
    if (group.length > 1) {
      parallelGroups.push(group);
    }
  }

  if (parallelGroups.length > 0) {
    lines.push("");
    lines.push("  Parallel execution detected:");
    const seen = new Set<string>();
    for (const group of parallelGroups) {
      const key = group.map((e) => e.label).sort().join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`    ${group.map((e) => e.label).join(" + ")} (overlapping)`);
    }
  }

  return lines.join("\n");
}

/** Generate a full profiling report as markdown. */
export function generateReport(): string {
  const stats = computeStats();
  if (stats.length === 0) return "# Profile Report\n\nNo measurements recorded.\n";

  const totalPipeline = _entries
    .filter((e) => e.category === "total_pipeline")
    .reduce((sum, e) => sum + e.durationMs, 0);

  const llmTotal = _entries
    .filter((e) => e.category === "llm_call_total")
    .reduce((sum, e) => sum + e.durationMs, 0);

  const memTotal = _entries
    .filter((e) => e.category === "memory_retrieval" || e.category === "memory_write")
    .reduce((sum, e) => sum + e.durationMs, 0);

  const toolTotal = _entries
    .filter((e) => e.category === "tool_execution")
    .reduce((sum, e) => sum + e.durationMs, 0);

  const wallClock = totalPipeline || Math.max(..._entries.map((e) => e.endMs));
  const llmPct = wallClock > 0 ? ((llmTotal / wallClock) * 100).toFixed(1) : "0";
  const memPct = wallClock > 0 ? ((memTotal / wallClock) * 100).toFixed(1) : "0";
  const toolPct = wallClock > 0 ? ((toolTotal / wallClock) * 100).toFixed(1) : "0";

  const lines = [
    `# Performance Profile Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Total wall-clock: ${formatMs(wallClock)}`,
    ``,
    `## Time Breakdown`,
    ``,
    `- LLM calls: ${formatMs(llmTotal)} (${llmPct}% of wall-clock)`,
    `- Memory ops: ${formatMs(memTotal)} (${memPct}%)`,
    `- Tool execution: ${formatMs(toolTotal)} (${toolPct}%)`,
    `- Other overhead: ${formatMs(Math.max(0, wallClock - llmTotal - memTotal - toolTotal))}`,
    ``,
    `## Category Summary`,
    ``,
    "```",
    renderTable(stats),
    "```",
    ``,
    `## Timeline`,
    ``,
    "```",
    renderTimeline(),
    "```",
    ``,
    `## Raw Entries (${_entries.length})`,
    ``,
    "```",
    ..._entries.map((e) =>
      `[+${formatMs(e.startMs).padStart(8)}] ${e.category.padEnd(22)} ${e.label.padEnd(30)} ${formatMs(e.durationMs).padStart(8)}${e.meta ? "  " + JSON.stringify(e.meta) : ""}`,
    ),
    "```",
    "",
  ];

  return lines.join("\n");
}
