import { useState, useEffect, useCallback, useRef } from "react";
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

interface GlobalLesson {
  id: string;
  text: string;
  sessionId: string;
  retrievalCount: number;
  helpedAvoidFailure: boolean;
  createdAt: number;
  promotedBy: string;
}

interface KnowledgeEdge {
  id: string;
  fromPatternId: string;
  toPatternId: string;
  relationship: string;
  strength: number;
}

interface MemoryHealth {
  totalGlobalPatterns: number;
  totalGlobalLessons: number;
  averagePatternAge: number;
  averageQualityScore: number;
  stalePatternsCount: number;
  knowledgeGraphEdges: number;
  oldestPattern: number | null;
  newestPattern: number | null;
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

type MemoryScope = "session" | "global";
type MemoryTab = "success" | "failures" | "curve" | "knowledge" | "health";

export function MemoryPanel() {
  const [scope, setScope] = useState<MemoryScope>("session");
  const [tab, setTab] = useState<MemoryTab>("success");
  const [patterns, setPatterns] = useState<SuccessPattern[]>([]);
  const [lessons, setLessons] = useState<string[]>([]);
  const [globalPatterns, setGlobalPatterns] = useState<SuccessPattern[]>([]);
  const [globalLessons, setGlobalLessons] = useState<GlobalLesson[]>([]);
  const [curves, setCurves] = useState<LearningCurve[]>([]);
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: string[]; edges: KnowledgeEdge[] }>({ nodes: [], edges: [] });
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

  const fetchGlobalPatterns = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/global/patterns`);
      const data = await res.json();
      setGlobalPatterns(data.patterns ?? []);
    } catch { /* ignore */ }
  }, [base]);

  const fetchGlobalLessons = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/global/lessons`);
      const data = await res.json();
      setGlobalLessons(data.lessons ?? []);
    } catch { /* ignore */ }
  }, [base]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/health`);
      const data = await res.json();
      setHealth(data);
    } catch { /* ignore */ }
  }, [base]);

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/memory/global/knowledge-graph`);
      const data = await res.json();
      setGraphData(data);
    } catch { /* ignore */ }
  }, [base]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchPatterns(), fetchLessons(), fetchCurves(),
      fetchGlobalPatterns(), fetchGlobalLessons(), fetchHealth(), fetchGraph(),
    ]).finally(() => setLoading(false));
  }, [fetchPatterns, fetchLessons, fetchCurves, fetchGlobalPatterns, fetchGlobalLessons, fetchHealth, fetchGraph]);

  const deletePattern = async (id: string) => {
    try {
      await fetch(`${base}/api/memory/success-patterns/${encodeURIComponent(id)}`, { method: "DELETE" });
      setPatterns((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  };

  const promotePattern = async (id: string) => {
    try {
      await fetch(`${base}/api/memory/global/promote/${encodeURIComponent(id)}`, { method: "POST" });
      await fetchGlobalPatterns();
    } catch { /* ignore */ }
  };

  const demotePattern = async (id: string) => {
    try {
      await fetch(`${base}/api/memory/global/demote/${encodeURIComponent(id)}`, { method: "POST" });
      setGlobalPatterns((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${base}/api/memory/global/export`, { method: "POST" });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `teamclaw-memory-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      await fetch(`${base}/api/memory/global/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await Promise.all([fetchGlobalPatterns(), fetchGlobalLessons(), fetchHealth(), fetchGraph()]);
    };
    input.click();
  };

  const activePatterns = scope === "session" ? patterns : globalPatterns;

  const filteredPatterns = activePatterns.filter(
    (p) =>
      !search ||
      p.taskDescription.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())),
  );

  const filteredLessons = lessons.filter(
    (l) => !search || l.toLowerCase().includes(search.toLowerCase()),
  );

  const tabs: MemoryTab[] = ["success", "failures", "curve", "knowledge", "health"];
  const tabIcons: Record<MemoryTab, string> = {
    success: "bi-trophy",
    failures: "bi-exclamation-triangle",
    curve: "bi-graph-up-arrow",
    knowledge: "bi-diagram-3",
    health: "bi-heart-pulse",
  };
  const tabLabels: Record<MemoryTab, string> = {
    success: `Patterns (${activePatterns.length})`,
    failures: `Failures (${scope === "session" ? lessons.length : globalLessons.length})`,
    curve: "Learning Curve",
    knowledge: `Graph (${graphData.edges.length})`,
    health: "Health",
  };

  return (
    <div className="space-y-3">
      {/* Scope toggle + export/import */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden">
          {(["session", "global"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                scope === s
                  ? "bg-stone-800 dark:bg-stone-600 text-white"
                  : "text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              {s === "session" ? "Session" : "Global"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-lg px-2 py-1 text-[10px] text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Export global memory"
          >
            <i className="bi bi-download mr-1" />Export
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-lg px-2 py-1 text-[10px] text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            title="Import global memory"
          >
            <i className="bi bi-upload mr-1" />Import
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
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
            <i className={`bi ${tabIcons[t]} mr-1`} />
            {tabLabels[t]}
          </button>
        ))}

        {(tab === "success" || tab === "failures") && (
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

      {/* Success / Patterns tab */}
      {!loading && tab === "success" && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredPatterns.length === 0 ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              No {scope} patterns stored yet.
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
                    {scope === "session" && (
                      <button
                        type="button"
                        onClick={() => promotePattern(p.id)}
                        className="text-stone-400 hover:text-blue-500 transition-colors"
                        title="Promote to Global"
                      >
                        <i className="bi bi-arrow-up-circle text-sm" />
                      </button>
                    )}
                    {scope === "global" && (
                      <button
                        type="button"
                        onClick={() => demotePattern(p.id)}
                        className="text-stone-400 hover:text-orange-500 transition-colors"
                        title="Demote from Global"
                      >
                        <i className="bi bi-arrow-down-circle text-sm" />
                      </button>
                    )}
                    {scope === "session" && (
                      <button
                        type="button"
                        onClick={() => deletePattern(p.id)}
                        className="text-stone-400 hover:text-rose-500 transition-colors"
                        title="Delete"
                      >
                        <i className="bi bi-trash text-sm" />
                      </button>
                    )}
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

      {/* Failures tab */}
      {!loading && tab === "failures" && (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {scope === "session" ? (
            filteredLessons.length === 0 ? (
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
            )
          ) : (
            globalLessons.length === 0 ? (
              <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
                No global failure lessons yet.
              </div>
            ) : (
              globalLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-3 py-2 text-xs text-stone-700 dark:text-stone-300 space-y-1"
                >
                  <div>{lesson.text}</div>
                  <div className="flex gap-3 text-[10px] text-stone-400 dark:text-stone-500">
                    <span>Retrieved: {lesson.retrievalCount}x</span>
                    <span>By: {lesson.promotedBy}</span>
                    {lesson.helpedAvoidFailure && <span className="text-emerald-500">Helped avoid failure</span>}
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}

      {/* Learning Curve tab */}
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

      {/* Knowledge Graph tab */}
      {!loading && tab === "knowledge" && (
        <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-3">
          {graphData.nodes.length === 0 ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              No knowledge graph data yet. Promote patterns to build the graph.
            </div>
          ) : (
            <KnowledgeGraph nodes={graphData.nodes} edges={graphData.edges} />
          )}
        </div>
      )}

      {/* Health tab */}
      {!loading && tab === "health" && (
        <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-4 space-y-3">
          {!health ? (
            <div className="text-xs text-stone-400 dark:text-stone-500 py-4 text-center">
              Unable to load health data.
            </div>
          ) : (
            <>
              <div className="text-xs font-medium text-stone-700 dark:text-stone-300">
                Global Memory Health
              </div>
              <div className="grid grid-cols-2 gap-3">
                <HealthStat label="Patterns" value={health.totalGlobalPatterns} />
                <HealthStat label="Lessons" value={health.totalGlobalLessons} />
                <HealthStat label="Graph Edges" value={health.knowledgeGraphEdges} />
                <HealthStat
                  label="Avg Quality"
                  value={`${(health.averageQualityScore * 100).toFixed(1)}%`}
                />
                <HealthStat
                  label="Avg Age"
                  value={health.averagePatternAge > 0
                    ? `${Math.round(health.averagePatternAge / (24 * 60 * 60 * 1000))}d`
                    : "N/A"}
                />
                <HealthStat label="Stale (>30d)" value={health.stalePatternsCount} />
                <HealthStat
                  label="Oldest"
                  value={health.oldestPattern
                    ? new Date(health.oldestPattern).toLocaleDateString()
                    : "N/A"}
                />
                <HealthStat
                  label="Newest"
                  value={health.newestPattern
                    ? new Date(health.newestPattern).toLocaleDateString()
                    : "N/A"}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HealthStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white dark:bg-stone-800 p-2 text-center">
      <div className="text-lg font-semibold text-stone-800 dark:text-stone-200">{value}</div>
      <div className="text-[10px] text-stone-500 dark:text-stone-400">{label}</div>
    </div>
  );
}

function KnowledgeGraph({ nodes, edges }: { nodes: string[]; edges: KnowledgeEdge[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 600;
  const height = 400;

  // Simple force-directed layout computed once
  const positions = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const pos = new Map<string, { x: number; y: number }>();
    // Initialize positions in a circle
    nodes.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos.set(id, {
        x: width / 2 + (width * 0.35) * Math.cos(angle),
        y: height / 2 + (height * 0.35) * Math.sin(angle),
      });
    });

    // Simple spring simulation — 50 iterations
    const edgeMap = edges.map((e) => ({
      from: pos.get(e.fromPatternId),
      to: pos.get(e.toPatternId),
    }));

    for (let iter = 0; iter < 50; iter++) {
      // Repulsion between all nodes
      const nodeList = Array.from(pos.entries());
      for (let i = 0; i < nodeList.length; i++) {
        for (let j = i + 1; j < nodeList.length; j++) {
          const a = nodeList[i][1];
          const b = nodeList[j][1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 500 / (dist * dist);
          a.x -= (dx / dist) * force;
          a.y -= (dy / dist) * force;
          b.x += (dx / dist) * force;
          b.y += (dy / dist) * force;
        }
      }

      // Attraction along edges
      for (const { from, to } of edgeMap) {
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 80) * 0.01;
        from.x += (dx / dist) * force;
        from.y += (dy / dist) * force;
        to.x -= (dx / dist) * force;
        to.y -= (dy / dist) * force;
      }

      // Keep in bounds
      for (const [, p] of pos) {
        p.x = Math.max(20, Math.min(width - 20, p.x));
        p.y = Math.max(20, Math.min(height - 20, p.y));
      }
    }

    positions.current = pos;
  }, [nodes, edges]);

  const edgeColors: Record<string, string> = {
    similar_to: "var(--color-blue-400, #60a5fa)",
    leads_to: "var(--color-emerald-400, #34d399)",
    conflicts_with: "var(--color-rose-400, #fb7185)",
    depends_on: "var(--color-amber-400, #fbbf24)",
  };

  return (
    <div className="space-y-2">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 400 }}>
        {edges.map((edge) => {
          const from = positions.current.get(edge.fromPatternId);
          const to = positions.current.get(edge.toPatternId);
          if (!from || !to) return null;
          return (
            <line
              key={edge.id}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={edgeColors[edge.relationship] ?? "#888"}
              strokeWidth={Math.max(1, edge.strength * 2)}
              opacity={0.6}
            />
          );
        })}
        {nodes.map((id) => {
          const pos = positions.current.get(id);
          if (!pos) return null;
          return (
            <g key={id}>
              <circle cx={pos.x} cy={pos.y} r="6" fill="var(--color-stone-500, #78716c)" />
              <title>{id}</title>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-3 text-[10px] text-stone-500 dark:text-stone-400 justify-center">
        <span><span className="inline-block w-3 h-0.5 bg-blue-400 mr-1 align-middle" />Similar</span>
        <span><span className="inline-block w-3 h-0.5 bg-emerald-400 mr-1 align-middle" />Leads to</span>
        <span><span className="inline-block w-3 h-0.5 bg-rose-400 mr-1 align-middle" />Conflicts</span>
        <span><span className="inline-block w-3 h-0.5 bg-amber-400 mr-1 align-middle" />Depends on</span>
      </div>
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
