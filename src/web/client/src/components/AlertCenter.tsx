import { useState } from "react";
import { useWsStore } from "../ws";

export function AlertCenter() {
  const alerts = useWsStore((s) => s.alerts);
  const pendingApproval = useWsStore((s) => s.pendingApproval);
  const removeAlert = useWsStore((s) => s.removeAlert);
  const setPendingApproval = useWsStore((s) => s.setPendingApproval);
  const sendMessage = useWsStore((s) => s.sendMessage);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  function handleApprove() {
    sendMessage({
      command: "approval_response",
      action: "approved",
    });
    setPendingApproval(null);
    setFeedbackOpen(false);
    setFeedbackText("");
  }

  function handleRejectSubmit() {
    const trimmed = feedbackText.trim();
    sendMessage({
      command: "approval_response",
      action: "feedback",
      feedback: trimmed || undefined,
    });
    setPendingApproval(null);
    setFeedbackOpen(false);
    setFeedbackText("");
  }

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 flex flex-col transition-colors duration-200 ease-in-out">
      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Alert Center</h2>

      <div className="mb-3 space-y-2">
        {pendingApproval ? (
          <div className="rounded-md border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-2 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-amber-800 dark:text-amber-300">Approval Required</span>
            </div>
            <p className="mb-1 text-[11px] text-amber-900 dark:text-amber-200">
              {(pendingApproval.description as string) ??
                "A task requires your approval before the workflow can continue."}
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleApprove}
                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-500 transition-colors duration-200 ease-in-out"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setFeedbackOpen((v) => !v)}
                className="rounded border border-amber-500 dark:border-amber-600 px-2 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-800/50 transition-colors duration-200 ease-in-out"
              >
                Reject &amp; Feedback
              </button>
            </div>
            {feedbackOpen && (
              <div className="mt-2 space-y-1">
                <textarea
                  rows={3}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="w-full rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-700 p-1 text-[11px] text-amber-900 dark:text-amber-100 outline-none focus:border-amber-500 focus:ring-0"
                  placeholder="Explain why you are rejecting or how the task should be changed..."
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackText("");
                    }}
                    className="rounded px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 ease-in-out"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectSubmit}
                    className="rounded bg-amber-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-amber-700 transition-colors duration-200 ease-in-out"
                  >
                    Send Feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">No pending approvals.</p>
        )}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Recent Alerts</h3>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pt-1">
        {alerts.length === 0 ? (
          <p className="text-[11px] text-gray-300 dark:text-gray-500">No alerts.</p>
        ) : (
          alerts
            .slice()
            .reverse()
            .map((alert) => (
              <div
                key={alert.id}
                className="flex items-start justify-between gap-2 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-2 text-[11px] transition-colors duration-200 ease-in-out"
              >
                <div>
                  <div className="mb-0.5 flex items-center gap-1">
                    <span className={badgeClassForType(alert.type)}>{badgeLabelForType(alert.type)}</span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-gray-800 dark:text-gray-200">{alert.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAlert(alert.id)}
                  className="ml-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200 ease-in-out"
                >
                  ×
                </button>
              </div>
            ))
        )}
      </div>
    </aside>
  );
}

function badgeClassForType(type: "approval_request" | "hallucination_warning" | "system_error"): string {
  if (type === "approval_request") {
    return "inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300";
  }
  if (type === "hallucination_warning") {
    return "inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/50 px-2 py-0.5 text-[10px] font-medium text-orange-800 dark:text-orange-300";
  }
  return "inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/50 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:text-red-300";
}

function badgeLabelForType(type: "approval_request" | "hallucination_warning" | "system_error"): string {
  if (type === "approval_request") return "Approval";
  if (type === "hallucination_warning") return "Hallucination";
  return "System";
}

