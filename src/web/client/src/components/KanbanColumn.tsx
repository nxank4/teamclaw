import { useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./TaskCard";

export interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Record<string, unknown>[];
}

export function KanbanColumn({ id, title, tasks }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[220px] flex-col rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 p-3 transition-colors duration-200 ease-in-out ${
        isOver ? "border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/40" : ""
      }`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {title}
        <span className="ml-1.5 rounded-full bg-gray-200 dark:bg-gray-600 px-2 py-0.5 text-xs">
          {tasks.length}
        </span>
      </h3>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">No tasks</p>
        ) : (
          tasks.map((task) => (
            <TaskCard key={(task.task_id as string) ?? Math.random()} task={task} />
          ))
        )}
      </div>
    </div>
  );
}
