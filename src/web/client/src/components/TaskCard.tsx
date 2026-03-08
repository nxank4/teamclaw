import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTimeboxCountdown } from "../hooks/useTimeboxCountdown";

export interface TaskCardProps {
  task: Record<string, unknown>;
}

function getPriorityBadgeColor(priority: string): string {
  const p = (priority as string || "MEDIUM").toUpperCase();
  if (p === "HIGH") return "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300";
  if (p === "LOW") return "bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300";
  return "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300";
}

export function TaskCard({ task }: TaskCardProps) {
  const taskId = (task.task_id as string) ?? "?";
  const description = (task.description as string) ?? "";
  const assignedTo = (task.assigned_to as string) ?? "";
  const priority = (task.priority as string) ?? "MEDIUM";
   const status = (task.status as string) ?? "pending";

  const { remainingSeconds, isExpired } = useTimeboxCountdown(task);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: taskId,
    data: task,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded bg-white dark:bg-gray-800 p-3 shadow-sm transition-all duration-200 ease-in-out cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-lg" : "hover:shadow"
      } ${
        status === "TIMEOUT_WARNING"
          ? "border-2 border-red-500 animate-pulse"
          : "border border-gray-200 dark:border-gray-600"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{taskId}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${getPriorityBadgeColor(priority)}`}
        >
          {priority}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-gray-800 dark:text-gray-200">{description || "(no description)"}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300">
          {assignedTo.slice(-1).toUpperCase() || "?"}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{assignedTo}</span>
      </div>
      {status === "in_progress" && remainingSeconds !== null && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">Timebox</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-mono ${
              isExpired ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300" : "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {formatSeconds(remainingSeconds)}
          </span>
        </div>
      )}
      {status === "TIMEOUT_WARNING" && (
        <div className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">
          Timebox exceeded – needs attention.
        </div>
      )}
    </div>
  );
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}
