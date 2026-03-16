import { useState, useEffect, useCallback } from "react";
import { getApiBase } from "../utils/api";

interface SuccessPattern {
  id: string;
  taskDescription: string;
  approach: string;
  confidence: number;
  approvalType: string;
  reworkCount: number;
  tags: string[];
  createdAt: number;
}

interface LearningCurveEntry {
  runIndex: number;
  averageConfidence: number;
  autoApprovedCount: number;
  patternsUsed: number;
  newPatternsStored: number;
}

interface LearningCurve {
  sessionId: string;
  runs: LearningCurveEntry[];
}

type MemoryTab = "success" | "failures" | "curve";

export function MemoryPanel() {
  const [tab, setTab] = useState<MemoryTab>("success");
  const [patterns, setPatterns] = useState<SuccessPattern[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);
  const [curves, setCurves] = useState<LearningCurve[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const base = getApiBase();

  const fetchPatterns = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/success-patterns`);
      const data = await res.json();
      setPatterns(data.patterns ?? []);
    } catch { /* ignore */ }
  }, [base]);

  const fetchLessons = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/lessons`);
      const data = await res.json();
      setLessons(data.lessons ?? []);
    } catch { /* ignore */ }
  }, [base]);

  const fetchCurves = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/learning-curve`);
      const data = await res.json();
      setCurves(data.curves ?? []);
    } catch { /* ignore */ }
  }, [base]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPatterns(), fetchLessons(), fetchCurves()]).finally(() =>
      setLoading(false),
    );
  }, [fetchPatterns, fetchLessons, fetchCurves]);

  const deletePattern = async (id: string) => {
    try {
      await fetch(`${base}/api/memory/success-patterns/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setPatterns((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  };

  const filteredPatterns = patterns.filter(
    (p) =>
      !search ||
      p.taskDescription.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  const filteredLessons = lessons.filter(
    (l) => !search || l.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(["success", "failures", "curve"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-stone-800 dark:bg-stone-700 text-white"
                : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            <i
              className={`bi ${
                t === "success"
                  ? "bi-trophy"
                  : t === "failures"
                    ? "bi-exclamation-triangle"
                    : "bi-graph-up-arrow"
              } mr-1`}
            />
            {t === "success"
              ? `Success (${patterns.length})`
              : t === "failures"
                ? `Failures (${lessons.length})`
                : "Learning Curve"}
          </button>
        ))}

        {tab !== "curve" && (
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-1.5 text-xs text-stone-800 dark:text-stone-200 w-48 focus:outline-none focus:ring-1 focus:ring-stone-400/30"
          />
        )}
      </div>

      {loading && (
        <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
          Loading...
        </div>
      )}

      {!loading && tab === "success" && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredPatterns.length === 0 ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              No success patterns stored yet.
            </div>
          ) : (
            filteredPatterns.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-3 text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-stone-800 dark:text-stone-200 leading-snug">
                    {p.taskDescription.slice(0, 100)}
                    {p.taskDescription.length > 100 ? "..." : ""}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        p.confidence >= 0.9
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          : p.confidence >= 0.75
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            : "bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-400"
                      }`}
                    >
                      {Math.round(p.confidence * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => deletePattern(p.id)}
                      className="text-stone-400 hover:text-rose-500 transition-colors"
                      title="Delete"
                    >
                      <i className="bi bi-trash text-sm" />
                    </button>
                  </div>
                </div>
                <div className="text-stone-500 dark:text-stone-400 line-clamp-2">
                  {p.approach.slice(0, 200)}
                </div>
                {p.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-stone-200 dark:bg-stone-700 px-1.5 py-0.5 text-[10px] text-stone-600 dark:text-stone-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === "failures" && (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {filteredLessons.length === 0 ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              No failure lessons stored yet.
            </div>
          ) : (
            filteredLessons.map((lesson, i) => (
              <div
                key={i}
                className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-3 py-2 text-xs text-stone-700 dark:text-stone-300"
              >
                {lesson}
              </div>
            ))
          )}
        </div>
      )}

      {!loading && tab === "curve" && (
        <div className="space-y-3">
          {curves.length === 0 ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              No learning curve data yet. Run multiple sessions to see trends.
            </div>
          ) : (
            curves.map((curve) => (
              <div
                key={curve.sessionId}
                className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-3 space-y-2"
              >
                <div className="text-xs font-medium text-stone-600 dark:text-stone-400">
                  Session: {curve.sessionId.slice(0, 20)}...
                </div>
                {curve.runs.length > 1 && (
                  <LearningCurveChart runs={curve.runs} />
                )}
                <div className="grid grid-cols-4 gap-2 text-[10px] text-stone-500 dark:text-stone-400">
                  {curve.runs.map((run) => (
                    <div key={run.runIndex} className="text-center">
                      <div className="font-medium">Run {run.runIndex}</div>
                      <div>Conf: {Math.round(run.averageConfidence * 100)}%</div>
                      <div>Auto: {run.autoApprovedCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LearningCurveChart({ runs }: { runs: LearningCurveEntry[] }) {
  const width = 280;
  const height = 80;
  const padding = 10;

  const maxConf = Math.max(...runs.map((r) => r.averageConfidence), 1);
  const points = runs.map((run, i) => {
    const x = padding + (i / Math.max(runs.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - (run.averageConfidence / maxConf) * (height - 2 * padding);
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: 80 }}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="var(--color-amber-500)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {runs.map((run, i) => {
        const x = padding + (i / Math.max(runs.length - 1, 1)) * (width - 2 * padding);
        const y = height - padding - (run.averageConfidence / maxConf) * (height - 2 * padding);
        return (
          <circle key={i} cx={x} cy={y} r="3" fill="var(--color-amber-500)" />
        );
      })}
    </svg>
  );
}
