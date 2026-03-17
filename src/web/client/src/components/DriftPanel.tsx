import { useState } from "react";

interface DriftConflict {
  conflictId: string;
  goalFragment: string;
  decision: {
    id: string;
    decision: string;
    reasoning: string;
    recommendedBy: string;
    confidence: number;
    capturedAt: number;
    topic: string;
    permanent?: boolean;
  };
  similarityScore: number;
  conflictType: "direct" | "indirect" | "ambiguous";
  explanation: string;
}

interface DriftResult {
  hasDrift: boolean;
  severity: "none" | "soft" | "hard";
  conflicts: DriftConflict[];
}

function ConflictCard({ conflict, expanded, onToggle }: {
  conflict: DriftConflict;
  expanded: boolean;
  onToggle: () => void;
}) {
  const d = conflict.decision;
  const date = new Date(d.capturedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const typeColors: Record<string, string> = {
    direct: "var(--red, #f87171)",
    indirect: "var(--yellow, #facc15)",
    ambiguous: "var(--text-muted, #888)",
  };

  return (
    <div
      style={{
        background: "var(--card-bg, #1e1e2e)",
        border: `1px solid ${typeColors[conflict.conflictType] ?? "#3a3a5a"}44`,
        borderRadius: "6px",
        padding: "0.75rem",
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <span style={{
          fontSize: "0.7rem", padding: "0.1rem 0.3rem", borderRadius: "3px",
          background: `${typeColors[conflict.conflictType]}22`,
          color: typeColors[conflict.conflictType],
          textTransform: "uppercase", fontWeight: 600,
        }}>
          {conflict.conflictType}
        </span>
        {d.permanent && <span title="Permanent decision">🔒</span>}
      </div>
      <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>{conflict.explanation}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #888)" }}>
        {d.recommendedBy} &middot; {date} &middot; {Math.round(d.confidence * 100)}% confidence
      </div>

      {expanded && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", borderTop: "1px solid var(--border, #3a3a5a)", paddingTop: "0.5rem" }}>
          <div><strong>Decision:</strong> {d.decision}</div>
          <div><strong>Reasoning:</strong> {d.reasoning}</div>
          <div><strong>Topic:</strong> {d.topic}</div>
        </div>
      )}
    </div>
  );
}

export function DriftPanel({
  result,
  onProceed,
  onReconsider,
  onAdjust,
  onAbort,
}: {
  result: DriftResult;
  onProceed: () => void;
  onReconsider: (decisionIds: string[]) => void;
  onAdjust: () => void;
  onAbort: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!result.hasDrift) return null;

  const icon = result.severity === "hard" ? "🚨" : "⚠️";
  const hasPermanent = result.conflicts.some((c) => c.decision.permanent);

  return (
    <div style={{
      background: "var(--card-bg, #1a1a2e)",
      border: `1px solid ${result.severity === "hard" ? "var(--red, #f87171)" : "var(--yellow, #facc15)"}44`,
      borderRadius: "8px",
      padding: "1rem",
      margin: "0.75rem 0",
    }}>
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
        {icon} {result.severity === "hard" ? "Strong drift detected" : "Drift detected"}
        {" — "}{result.conflicts.length} conflict(s)
      </h3>

      <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {result.conflicts.map((c) => (
          <ConflictCard
            key={c.conflictId}
            conflict={c}
            expanded={expandedId === c.conflictId}
            onToggle={() => setExpandedId(expandedId === c.conflictId ? null : c.conflictId)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {!hasPermanent && (
          <button onClick={onProceed} style={btnStyle("var(--green, #4ade80)")}>
            Proceed anyway
          </button>
        )}
        <button
          onClick={() => onReconsider(result.conflicts.map((c) => c.decision.id))}
          style={btnStyle("var(--yellow, #facc15)")}
        >
          Reconsider past decisions
        </button>
        <button onClick={onAdjust} style={btnStyle("var(--blue, #60a5fa)")}>
          Adjust goal
        </button>
        <button onClick={onAbort} style={btnStyle("var(--red, #f87171)")}>
          Abort
        </button>
      </div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    borderRadius: "4px",
    padding: "0.35rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.8rem",
  };
}
