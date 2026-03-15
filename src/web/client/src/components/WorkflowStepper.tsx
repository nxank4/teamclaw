import { useWsStore } from "../ws";

const WORKFLOW_NODES = [
  "memory_retrieval",
  "sprint_planning",
  "system_design",
  "rfc_phase",
  "coordinator",
  "approval",
  "worker_execute",
  "human_approval",
  "increment_cycle",
];

const NODE_LABELS: Record<string, string> = {
  memory_retrieval: "Memory Retrieval",
  sprint_planning: "Sprint Planning",
  system_design: "System Design",
  rfc_phase: "RFC Phase",
  coordinator: "Coordinator",
  approval: "Approval",
  worker_execute: "Worker Execute",
  human_approval: "Human Approval",
  increment_cycle: "Increment Cycle",
};

export function WorkflowStepper() {
  const activeNode = useWsStore((s) => s.activeNode);
  const completedNodes = useWsStore((s) => s.completedNodes);

  return (
    <div className="flex items-center gap-0.5">
      {WORKFLOW_NODES.map((node, i) => {
        const isActive = activeNode === node;
        const isCompleted = completedNodes.includes(node);

        let dotClass = "bg-stone-300 dark:bg-stone-600";
        if (isActive) dotClass = "bg-amber-500 animate-glow-pulse";
        else if (isCompleted) dotClass = "bg-emerald-500";

        return (
          <div key={node} className="flex items-center">
            <div className="group relative p-1">
              <div
                className={`h-2 w-2 rounded-full transition-transform duration-150 group-hover:scale-150 group-hover:ring-2 group-hover:ring-amber-400/40 ${dotClass} ${isCompleted ? "flex items-center justify-center" : ""}`}
              >
                {isCompleted && (
                  <svg className="h-1.5 w-1.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <div className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-800 dark:bg-stone-200 px-2 py-1 text-xs text-stone-100 dark:text-stone-800 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2 before:border-4 before:border-transparent before:border-b-stone-800 dark:before:border-b-stone-200">
                {i + 1}. {NODE_LABELS[node] ?? node}
              </div>
            </div>
            {i < WORKFLOW_NODES.length - 1 && (
              <div className={`h-0.5 w-3 ${isCompleted ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-600"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
