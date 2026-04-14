import { useWsStore } from "../ws";

interface PreviewTask {
  task_id: string;
  description: string;
  assigned_to: string;
  complexity: string;
  dependencies: string[];
}

interface CostEstimate {
  estimatedUSD: number;
  parallelWaves: number;
  rfcRequired: boolean;
  estimatedMinutes: number;
}

interface PreviewData {
  tasks: PreviewTask[];
  estimate: CostEstimate;
  status: string;
}

export function PreviewPanel() {
  const preview = useWsStore((s) => s.pendingPreview) as PreviewData | null;
  const sendCommand = useWsStore((s) => s.sendCommand);
  const clearPreview = useWsStore((s) => s.clearPendingPreview);

  if (!preview || preview.status !== "pending") return null;

  const { tasks, estimate } = preview;

  const respond = (action: "approve" | "abort") => {
    sendCommand("preview_response", { action });
    clearPreview();
  };

  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-gradient-to-br from-white to-stone-50 dark:from-stone-900 dark:to-stone-950 p-5 shadow-sm space-y-4 animate-drop-in">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
          <i className="bi bi-list-check mr-2" />
          Sprint Preview
        </h2>
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 rounded-full px-2 py-0.5">
          {tasks.length} tasks &middot; ~{estimate.parallelWaves} wave{estimate.parallelWaves !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cost estimate card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Est. Cost" value={`~$${estimate.estimatedUSD.toFixed(2)}`} />
        <Stat label="Waves" value={String(estimate.parallelWaves)} />
        <Stat label="Est. Time" value={`~${estimate.estimatedMinutes}min`} />
        <Stat label="RFC Required" value={estimate.rfcRequired ? "Yes" : "No"} />
      </div>

      {/* Task table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs font-medium text-stone-500 dark:text-stone-400">
              <th className="py-2 pr-3">ID</th>
              <th className="py-2 pr-3">Task</th>
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2 pr-3">Complexity</th>
              <th className="py-2">Deps</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.task_id} className="border-b border-stone-100 dark:border-stone-800">
                <td className="py-2 pr-3 font-mono text-xs text-stone-600 dark:text-stone-400">{t.task_id}</td>
                <td className="py-2 pr-3 text-stone-800 dark:text-stone-200 max-w-xs truncate">{t.description}</td>
                <td className="py-2 pr-3 text-stone-600 dark:text-stone-400">{t.assigned_to}</td>
                <td className="py-2 pr-3">
                  <ComplexityBadge complexity={t.complexity} />
                </td>
                <td className="py-2 text-xs text-stone-500 dark:text-stone-400">
                  {t.dependencies.length > 0 ? t.dependencies.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => respond("approve")}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-4 py-2 text-sm transition-colors"
        >
          <i className="bi bi-check-lg mr-1" />
          Approve and run
        </button>
        <button
          type="button"
          onClick={() => respond("abort")}
          className="rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium px-4 py-2 text-sm transition-colors"
        >
          Abort
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-100 dark:bg-stone-800 px-3 py-2">
      <div className="text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold text-stone-800 dark:text-stone-100 mt-0.5">{value}</div>
    </div>
  );
}

function ComplexityBadge({ complexity }: { complexity: string }) {
  const colors: Record<string, string> = {
    LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    HIGH: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    ARCHITECTURE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[complexity] ?? colors.MEDIUM}`}>
      {complexity}
    </span>
  );
}
