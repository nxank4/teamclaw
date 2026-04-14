import { useState, useCallback } from "react";

interface HandoffData {
  generatedAt: number;
  sessionId: string;
  projectPath: string;
  completedGoal: string;
  sessionStatus: "complete" | "partial" | "failed";
  currentState: string[];
  activeDecisions: Array<{ decision: string; reasoning: string; recommendedBy: string; confidence: number }>;
  leftToDo: Array<{ description: string; type: string; priority: string }>;
  teamLearnings: string[];
  teamPerformance: Array<{ agentRole: string; note: string }>;
  resumeCommands: string[];
}

type PanelStatus = "idle" | "loading" | "loaded" | "generating" | "importing" | "error";

export function HandoffPanel() {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [data, setData] = useState<HandoffData | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const loadData = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const resp = await fetch("/api/handoff");
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "Failed to load" }));
        throw new Error((body as { error?: string }).error ?? "Failed to load");
      }
      const json = (await resp.json()) as HandoffData;
      setData(json);
      setStatus("loaded");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const generate = useCallback(async () => {
    setStatus("generating");
    setError("");
    setMessage("");
    try {
      const resp = await fetch("/api/handoff/generate", { method: "POST" });
      if (!resp.ok) throw new Error("Generation failed");
      const json = (await resp.json()) as { path: string; markdown: string };
      setMarkdown(json.markdown);
      setMessage(`Written to ${json.path}`);
      setStatus("loaded");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const handleImport = useCallback(async () => {
    setStatus("importing");
    setError("");
    setMessage("");
    try {
      const resp = await fetch("/api/handoff/import", { method: "POST" });
      if (!resp.ok) throw new Error("Import failed");
      const json = (await resp.json()) as { imported: number; skipped: number };
      setMessage(`Imported ${json.imported} decisions (${json.skipped} skipped)`);
      setStatus("loaded");
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, []);

  const download = useCallback(() => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CONTEXT.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [markdown]);

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginBottom: "1rem" }}>Context Handoff</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button onClick={loadData} disabled={status === "loading"}>
          {status === "loading" ? "Loading..." : "Load Current"}
        </button>
        <button onClick={generate} disabled={status === "generating"}>
          {status === "generating" ? "Generating..." : "Generate CONTEXT.md"}
        </button>
        <button onClick={handleImport} disabled={status === "importing"}>
          {status === "importing" ? "Importing..." : "Import"}
        </button>
        {markdown && <button onClick={download}>Download</button>}
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: "1rem" }}>{error}</div>
      )}
      {message && (
        <div style={{ color: "#22c55e", marginBottom: "1rem" }}>{message}</div>
      )}

      {data && (
        <div style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <strong>Session:</strong> {data.sessionId}<br />
            <strong>Goal:</strong> {data.completedGoal}<br />
            <strong>Status:</strong> {data.sessionStatus === "complete" ? "\u2705" : data.sessionStatus === "failed" ? "\u274c" : "\u26a0\ufe0f"} {data.sessionStatus}
          </div>

          {data.currentState.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <strong>Current State:</strong>
              <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                {data.currentState.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          {data.leftToDo.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <strong>Left To Do:</strong>
              <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                {data.leftToDo.map((item, i) => (
                  <li key={i}>{item.description} <span style={{ color: "#94a3b8" }}>({item.type})</span></li>
                ))}
              </ul>
            </div>
          )}

          {data.resumeCommands.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <strong>Resume Commands:</strong>
              <pre style={{ background: "#1e293b", padding: "0.5rem", borderRadius: "4px", overflow: "auto" }}>
                {data.resumeCommands.join("\n")}
              </pre>
            </div>
          )}
        </div>
      )}

      {markdown && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer" }}>Preview CONTEXT.md</summary>
          <pre style={{ background: "#0f172a", padding: "1rem", borderRadius: "4px", overflow: "auto", maxHeight: "400px", fontSize: "0.8rem" }}>
            {markdown}
          </pre>
        </details>
      )}
    </div>
  );
}
