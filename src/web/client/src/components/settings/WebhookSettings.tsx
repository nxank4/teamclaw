import { useState } from "react";

const inputClass = "w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-sm text-stone-800 dark:text-stone-200 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-[border-color,box-shadow] duration-150 placeholder:text-stone-400 dark:placeholder:text-stone-500";

const selectClass = "w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-sm text-stone-800 dark:text-stone-200 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-[border-color,box-shadow] duration-150";

interface WebhookSettingsProps {
  webhookOnTaskComplete: string;
  webhookOnCycleEnd: string;
  webhookSecret: string;
  webhookApprovalUrl?: string;
  webhookApprovalProvider?: string;
  webhookApprovalTimeoutSeconds?: number;
  onChange: (field: string, value: string | number) => void;
}

export function WebhookSettings({
  webhookOnTaskComplete,
  webhookOnCycleEnd,
  webhookSecret,
  webhookApprovalUrl = "",
  webhookApprovalProvider = "generic",
  webhookApprovalTimeoutSeconds = 300,
  onChange,
}: WebhookSettingsProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const handleTestWebhook = async () => {
    if (!webhookApprovalUrl) return;
    setTestStatus("Sending...");
    try {
      const res = await fetch("/webhook/approval/status");
      if (res.ok) {
        setTestStatus("Webhook endpoint reachable");
      } else {
        setTestStatus(`Error: ${res.status}`);
      }
    } catch (err) {
      setTestStatus(`Failed: ${String(err)}`);
    }
    setTimeout(() => setTestStatus(null), 3000);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">Webhooks</h3>

      <div>
        <label htmlFor="wh-task" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
          Task Complete URL
        </label>
        <input
          id="wh-task"
          type="text"
          value={webhookOnTaskComplete}
          onChange={(e) => onChange("webhookOnTaskComplete", e.target.value)}
          placeholder="https://hooks.example.com/task-complete"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="wh-cycle" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
          Cycle End URL
        </label>
        <input
          id="wh-cycle"
          type="text"
          value={webhookOnCycleEnd}
          onChange={(e) => onChange("webhookOnCycleEnd", e.target.value)}
          placeholder="https://hooks.example.com/cycle-end"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="wh-secret" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
          Webhook Secret
        </label>
        <div className="relative">
          <input
            id="wh-secret"
            type={showSecret ? "text" : "password"}
            value={webhookSecret}
            onChange={(e) => onChange("webhookSecret", e.target.value)}
            placeholder="Optional signing secret"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            {showSecret ? "Hide" : "Show"}
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-400">Sent as X-Webhook-Signature header.</p>
      </div>

      <div className="pt-2 border-t border-stone-200 dark:border-stone-700">
        <h4 className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-2">Approval Webhooks</h4>

        <div>
          <label htmlFor="wh-approval-url" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
            Approval Webhook URL
          </label>
          <input
            id="wh-approval-url"
            type="text"
            value={webhookApprovalUrl}
            onChange={(e) => onChange("webhookApprovalUrl", e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className={inputClass}
          />
          <p className="mt-1 text-xs text-stone-400">Endpoint for approval requests (Slack incoming webhook or generic URL).</p>
        </div>

        <div className="mt-2">
          <label htmlFor="wh-approval-provider" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
            Approval Provider
          </label>
          <select
            id="wh-approval-provider"
            value={webhookApprovalProvider}
            onChange={(e) => onChange("webhookApprovalProvider", e.target.value)}
            className={selectClass}
          >
            <option value="generic">Generic</option>
            <option value="slack">Slack</option>
          </select>
        </div>

        <div className="mt-2">
          <label htmlFor="wh-approval-timeout" className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
            Approval Timeout (seconds)
          </label>
          <input
            id="wh-approval-timeout"
            type="number"
            min={30}
            max={3600}
            value={webhookApprovalTimeoutSeconds}
            onChange={(e) => onChange("webhookApprovalTimeoutSeconds", parseInt(e.target.value, 10) || 300)}
            className={inputClass}
          />
        </div>

        {webhookApprovalUrl && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleTestWebhook}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
            >
              Test Webhook
            </button>
            {testStatus && (
              <span className="ml-2 text-xs text-stone-400">{testStatus}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
