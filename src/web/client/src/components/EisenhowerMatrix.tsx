import { DndContext, type DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useWsStore } from "../ws";

type QuadrantId =
  | "urgent_important"
  | "not_urgent_important"
  | "urgent_not_important"
  | "not_urgent_not_important";

function getQuadrantForTask(task: Record<string, unknown>): QuadrantId {
  const rawUrgency = Number(task.urgency ?? 5);
  const rawImportance = Number(task.importance ?? 5);
  const urgency = Number.isFinite(rawUrgency) ? rawUrgency : 5;
  const importance = Number.isFinite(rawImportance) ? rawImportance : 5;
  const urgent = urgency >= 6;
  const important = importance >= 6;
  if (urgent && important) return "urgent_important";
  if (!urgent && important) return "not_urgent_important";
  if (urgent && !important) return "urgent_not_important";
  return "not_urgent_not_important";
}

function getScoresForQuadrant(id: QuadrantId): { urgency: number; importance: number } {
  switch (id) {
    case "urgent_important":
      return { urgency: 8, importance: 8 };
    case "not_urgent_important":
      return { urgency: 3, importance: 8 };
    case "urgent_not_important":
      return { urgency: 8, importance: 3 };
    case "not_urgent_not_important":
    default:
      return { urgency: 3, importance: 3 };
  }
}

function MatrixQuadrant({
  id,
  title,
  subtitle,
  tasks,
}: {
  id: QuadrantId;
  title: string;
  subtitle: string;
  tasks: Record<string, unknown>[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[140px] flex-1 flex-col rounded-md border p-2 text-xs transition-colors duration-200 ease-in-out ${
        isOver ? "border-blue-400 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-900/40" : "border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-800/70"
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{title}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">{subtitle}</div>
        </div>
        <span className="rounded-full bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        {tasks.length === 0 ? (
          <div className="pt-4 text-center text-[10px] text-gray-300 dark:text-gray-500">No tasks</div>
        ) : (
          tasks.map((t) => <MatrixTaskCard key={(t.task_id as string) ?? Math.random()} task={t} />)
        )}
      </div>
    </div>
  );
}

function MatrixTaskCard({ task }: { task: Record<string, unknown> }) {
  const taskId = (task.task_id as string) ?? "?";
  const description = (task.description as string) ?? "";
  const priority = (task.priority as string) ?? "MEDIUM";
  const urgency = Number(task.urgency ?? 5);
  const importance = Number(task.importance ?? 5);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: taskId,
    data: task,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-[11px] shadow-sm transition-colors duration-200 ease-in-out ${
        isDragging ? "opacity-60 shadow-md" : ""
      } cursor-grab active:cursor-grabbing`}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{taskId}</span>
        <span className="rounded bg-gray-100 dark:bg-gray-600 px-1 text-[10px] uppercase text-gray-600 dark:text-gray-300">
          {priority}
        </span>
      </div>
      <div className="line-clamp-2 text-[11px] text-gray-800 dark:text-gray-200">
        {description || "(no description)"}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-gray-500 dark:text-gray-400">
        <span>U:{Number.isFinite(urgency) ? urgency : "-"}</span>
        <span>I:{Number.isFinite(importance) ? importance : "-"}</span>
      </div>
    </div>
  );
}

export function EisenhowerMatrix() {
  const task_queue = useWsStore((s) => s.task_queue);
  const sendMessage = useWsStore((s) => s.sendMessage);

  const matrixTasks = task_queue.filter((t) => {
    const status = (t.status as string) ?? "pending";
    return status === "pending" || status === "backlog";
  });

  const tasksByQuadrant: Record<QuadrantId, Record<string, unknown>[]> = {
    urgent_important: [],
    urgent_not_important: [],
    not_urgent_important: [],
    not_urgent_not_important: [],
  };

  for (const task of matrixTasks) {
    const q = getQuadrantForTask(task);
    tasksByQuadrant[q].push(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const quadrantId = over.id as QuadrantId;
    if (!quadrantId) return;

    const scores = getScoresForQuadrant(quadrantId);
    sendMessage({
      type: "UPDATE_TASK",
      taskId,
      updates: {
        urgency: scores.urgency,
        importance: scores.importance,
      },
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 shadow-sm transition-colors duration-200 ease-in-out">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Eisenhower Matrix</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Drag pending tasks between quadrants to adjust urgency and importance.
          </p>
        </div>
      </header>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MatrixQuadrant
            id="urgent_important"
            title="Do Now"
            subtitle="Urgent & Important"
            tasks={tasksByQuadrant.urgent_important}
          />
          <MatrixQuadrant
            id="urgent_not_important"
            title="Delegate"
            subtitle="Urgent, Not Important"
            tasks={tasksByQuadrant.urgent_not_important}
          />
          <MatrixQuadrant
            id="not_urgent_important"
            title="Schedule"
            subtitle="Not Urgent, Important"
            tasks={tasksByQuadrant.not_urgent_important}
          />
          <MatrixQuadrant
            id="not_urgent_not_important"
            title="Eliminate"
            subtitle="Not Urgent, Not Important"
            tasks={tasksByQuadrant.not_urgent_not_important}
          />
        </div>
      </DndContext>
    </section>
  );
}

