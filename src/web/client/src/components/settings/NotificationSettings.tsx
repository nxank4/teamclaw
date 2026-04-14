import { useWsStore, type AlertType } from "../../ws";

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  approval_request: "Approvals",
  hallucination_warning: "Hallucinations",
  system_error: "System Errors",
  timeout: "Timeouts",
};

export function NotificationSettings() {
  const notificationPrefs = useWsStore((s) => s.notificationPrefs);
  const setNotificationPrefs = useWsStore((s) => s.setNotificationPrefs);
  const toggleNotificationType = useWsStore((s) => s.toggleNotificationType);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300">
        <i className="bi bi-bell mr-1.5" />Notification Preferences
      </h3>
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm text-stone-700 dark:text-stone-300">Notifications enabled</span>
        <button
          type="button"
          onClick={() => setNotificationPrefs({ enabled: !notificationPrefs.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${notificationPrefs.enabled ? "bg-blue-500" : "bg-stone-300 dark:bg-stone-600"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${notificationPrefs.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </label>
      {notificationPrefs.enabled && (
        <div className="space-y-1.5 pl-1">
          {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.types[t]}
                onChange={() => toggleNotificationType(t)}
                className="h-3.5 w-3.5 rounded border-stone-300 dark:border-stone-600 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-stone-600 dark:text-stone-400">{ALERT_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
