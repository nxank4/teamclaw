import { useEffect, useState } from "react";
import { getApiBase } from "../../utils/api";

interface ActiveAgent {
  role: string;
  reason: string;
  confidence: number;
}

interface ExcludedAgent {
  role: string;
  reason: string;
}

interface CompositionEntry {
  id: string;
  composition: {
    mode: string;
    activeAgents: ActiveAgent[];
    excludedAgents: ExcludedAgent[];
    overallConfidence: number;
    analyzedGoal: string;
  };
  goal: string;
  runId: number;
  success: boolean;
  createdAt: string;
}

export function CompositionSettings() {
  const [history, setHistory] = useState<CompositionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const base = getApiBase();
    if (!base) return;
    setLoading(true);
    fetch(`${base}/api/composition-history`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.history)) setHistory(data.history);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const labelClass = "text-xs font-medium text-stone-600 dark:text-stone-400";
  const badgeGreen = "inline-block rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs px-2 py-0.5";
  const badgeYellow = "inline-block rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs px-2 py-0.5";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
        <i className="bi bi-people mr-1" />
        Team Composition
      </h3>

      <p className="text-xs text-stone-500 dark:text-stone-400">
        When autonomous mode is enabled, the coordinator selects agents based on goal keywords.
        Configure via <code className="text-amber-600 dark:text-amber-400">team_mode</code> in teamclaw.config.json or <code className="text-amber-600 dark:text-amber-400">--team autonomous</code>.
      </p>

      <div>
        <p className={`${labelClass} mb-2`}>Recent Compositions</p>
        {loading && <p className="text-xs text-stone-400">Loading...</p>}
        {!loading && history.length === 0 && (
          <p className="text-xs text-stone-400 italic">No composition history yet.</p>
        )}
        {history.map((entry) => (
          <div
            key={entry.id}
            className="mb-2 rounded-lg border border-stone-200 dark:border-stone-700 p-3 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Run #{entry.runId}
              </span>
              <span className={entry.success ? badgeGreen : badgeYellow}>
                {entry.success ? "success" : "failed"}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
              {entry.goal}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.composition.activeAgents
                .filter((a) => !["coordinator", "memory_retrieval", "worker_task", "approval"].includes(a.role))
                .map((a) => (
                  <span key={a.role} className={badgeGreen}>
                    {a.role} ({(a.confidence * 100).toFixed(0)}%)
                  </span>
                ))}
              {entry.composition.excludedAgents.map((a) => (
                <span key={a.role} className={badgeYellow}>
                  {a.role}
                </span>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
