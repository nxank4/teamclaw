import { useRef, useEffect, useState, useCallback } from "react";
import { useWsStore, type LlmLogFilter, type LlmSourceFilter } from "../ws/store";

const LEVEL_STYLES: Record<string, { badge: string; border: string }> = {
  info: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    border: "border-l-blue-400 dark:border-l-blue-500",
  },
  success: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    border: "border-l-emerald-400 dark:border-l-emerald-500",
  },
  warn: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    border: "border-l-amber-400 dark:border-l-amber-500",
  },
  error: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    border: "border-l-red-400 dark:border-l-red-500",
  },
};

const FILTERS: { label: string; value: LlmLogFilter }[] = [
  { label: "All", value: "all" },
  { label: "Info", value: "info" },
  { label: "Success", value: "success" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
];

const SOURCE_FILTERS: { label: string; value: LlmSourceFilter }[] = [
  { label: "All Sources", value: "all" },
  { label: "LLM", value: "llm-client" },
  { label: "Worker", value: "worker-adapter" },
  { label: "Gateway", value: "gateway" },
  { label: "Console", value: "console" },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function sourceIcon(source: string) {
  if (source === "llm-client") return <i className="bi bi-globe2 text-[11px]" />;
  if (source === "gateway") return <i className="bi bi-hdd-network text-[11px]" />;
  if (source === "console") return <i className="bi bi-terminal text-[11px]" />;
  return <i className="bi bi-cpu text-[11px]" />;
}

export function LlmLogPanel() {
  const logs = useWsStore((s) => s.llmLogs);
  const filter = useWsStore((s) => s.llmLogFilter);
  const setFilter = useWsStore((s) => s.setLlmLogFilter);
  const sourceFilter = useWsStore((s) => s.llmSourceFilter);
  const setSourceFilter = useWsStore((s) => s.setLlmSourceFilter);
  const clearLogs = useWsStore((s) => s.clearLlmLogs);

  const listRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const filtered = logs.filter((l) => {
    if (filter !== "all" && l.level !== filter) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    return true;
  });

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const handleCopy = useCallback(() => {
    const text = filtered
      .map((entry) => {
        let line = `[${formatTime(entry.timestamp)}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`;
        if (entry.meta && Object.keys(entry.meta).length > 0) {
          for (const [k, v] of Object.entries(entry.meta)) {
            line += `\n  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
          }
        }
        return line;
      })
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    });
  }, [filtered]);

  if (logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-400 dark:text-stone-500 text-sm">
        No logs yet. Logs appear when the session starts.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 dark:border-stone-700 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  filter === f.value
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : "text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="h-3 w-px bg-stone-300 dark:bg-stone-600" />
          <div className="flex items-center gap-1">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSourceFilter(f.value)}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  sourceFilter === f.value
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : "text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-stone-400 dark:text-stone-500">
            {filtered.length} / {logs.length}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded px-2 py-0.5 text-[11px] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            {copyLabel}
          </button>
          <button
            type="button"
            onClick={clearLogs}
            className="rounded px-2 py-0.5 text-[11px] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto text-[12px] font-mono select-text"
      >
        {filtered.map((entry) => {
          const style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info;
          const isExpanded = expandedId === entry.id;
          const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;

          return (
            <div
              key={entry.id}
              className={`flex flex-col border-l-2 ${style.border} border-b border-stone-100 dark:border-stone-800 hover:bg-stone-100/50 dark:hover:bg-stone-900/50`}
            >
              <div className="flex items-center gap-2 px-3 py-1">
                {hasMeta ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="shrink-0 w-4 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    <i className={`bi ${isExpanded ? "bi-chevron-down" : "bi-chevron-right"} text-[10px]`} />
                  </button>
                ) : (
                  <span className="shrink-0 w-4" />
                )}
                <span className="shrink-0 text-stone-400 dark:text-stone-500 w-[60px]">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold uppercase ${style.badge}`}>
                  {entry.level}
                </span>
                <span className="shrink-0 text-stone-400 dark:text-stone-500" title={entry.source}>
                  {sourceIcon(entry.source)}
                </span>
                {entry.model && (
                  <span className="shrink-0 rounded bg-stone-200 dark:bg-stone-700 px-1.5 py-0 text-[10px] text-stone-600 dark:text-stone-300 max-w-[120px] truncate">
                    {entry.model}
                  </span>
                )}
                {entry.botId && (
                  <span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0 text-[10px] text-indigo-600 dark:text-indigo-300 max-w-[80px] truncate">
                    {entry.botId}
                  </span>
                )}
                <span className="truncate text-stone-700 dark:text-stone-300">
                  {entry.message}
                </span>
              </div>
              {isExpanded && hasMeta && (
                <div className="mx-3 mb-1.5 rounded bg-stone-100 dark:bg-stone-800/60 p-2 text-[11px] text-stone-600 dark:text-stone-400">
                  {Object.entries(entry.meta!).map(([k, v]) => (
                    <div key={k}>
                      <span className="font-semibold text-stone-500 dark:text-stone-400">{k}:</span>{" "}
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
