import { useState } from "react";

export interface HeatmapPanelProps {
  data: HeatmapPanelData;
}

export interface HeatmapPanelData {
  rows: { agentRole: string; displayName: string; overallUtilization: number; isBottleneck: boolean }[];
  columns: { id: string; label: string }[];
  cells: { agentRole: string; columnId: string; value: number; displayValue: string }[][];
  bottlenecks: { agentRole: string; utilizationPct: number; queueDepth: number }[];
  suggestions: { type: string; agentRole: string; suggestion: string; estimatedImpact: string }[];
}

type Metric = "duration" | "cost" | "confidence";

function cellColor(value: number, isBottleneck: boolean): string {
  if (value === 0) return "bg-stone-100 dark:bg-stone-800";
  if (isBottleneck && value > 0.7) return "bg-rose-200 dark:bg-rose-900/50";
  if (value > 0.7) return "bg-amber-200 dark:bg-amber-900/40";
  if (value > 0.4) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-emerald-100 dark:bg-emerald-900/30";
}

function utilBar(pct: number): string {
  const filled = Math.round(pct * 10);
  return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
}

export function HeatmapPanel({ data }: HeatmapPanelProps) {
  const [metric, setMetric] = useState<Metric>("duration");

  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4">
        <p className="text-sm text-stone-500 dark:text-stone-400">No utilization data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-stone-600 dark:text-stone-400">Metric:</span>
        {(["duration", "cost", "confidence"] as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              metric === m
                ? "bg-amber-500 text-white"
                : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th className="px-3 py-2 text-left font-semibold text-stone-600 dark:text-stone-400">Agent</th>
              {data.columns.map((col) => (
                <th key={col.id} className="px-2 py-2 text-center font-medium text-stone-500 dark:text-stone-400">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-stone-600 dark:text-stone-400">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr
                key={row.agentRole}
                className={`border-b border-stone-100 dark:border-stone-800 ${row.isBottleneck ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}`}
              >
                <td className="px-3 py-2 font-medium text-stone-700 dark:text-stone-200 whitespace-nowrap">
                  {row.displayName}
                  {row.isBottleneck && (
                    <span className="ml-1 text-[10px] text-rose-600 dark:text-rose-400 font-bold">BOTTLENECK</span>
                  )}
                </td>
                {data.cells[i]?.map((cell, j) => (
                  <td key={j} className="px-1 py-1 text-center">
                    <div className={`rounded px-1.5 py-1 ${cellColor(cell.value, row.isBottleneck)}`}>
                      <span className="text-stone-700 dark:text-stone-200 font-mono">{cell.displayValue}</span>
                    </div>
                  </td>
                ))}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className={`font-medium ${row.isBottleneck ? "text-rose-600 dark:text-rose-400" : "text-stone-600 dark:text-stone-400"}`}>
                    {Math.round(row.overallUtilization * 100)}%
                  </span>
                  <span className="ml-1 font-mono text-[10px] text-stone-400">
                    {utilBar(row.overallUtilization)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottleneck Alerts */}
      {data.bottlenecks.length > 0 && (
        <div className="space-y-2">
          {data.bottlenecks.map((alert, i) => (
            <div key={i} className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-4 py-2 text-sm text-rose-800 dark:text-rose-200">
              <i className="bi bi-exclamation-triangle mr-1" />
              <strong>{alert.agentRole.replace(/_/g, " ")}</strong> — {Math.round(alert.utilizationPct * 100)}% utilization
              {alert.queueDepth > 1 && `, ${alert.queueDepth} tasks queued`}
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {data.suggestions.length > 0 && (
        <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 space-y-3">
          <h4 className="text-xs font-semibold text-stone-600 dark:text-stone-400">Optimization Suggestions</h4>
          {data.suggestions.map((s, i) => (
            <div key={i} className="text-sm text-stone-700 dark:text-stone-300">
              <span className="font-mono text-amber-600 dark:text-amber-400 mr-1">
                {s.type === "reassign" ? "\u2192" : s.type === "parallelize" ? "\u2016" : s.type === "swap_model" ? "\u2195" : "\u00d7"}
              </span>
              {s.suggestion}
              <span className="ml-1 text-xs text-stone-500 dark:text-stone-400">({s.estimatedImpact})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
