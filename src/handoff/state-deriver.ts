export interface CompletedTask {
  description: string;
  confidence: number;
}

const VERB_MAP: Record<string, string> = {
  implement: "implemented",
  add: "added",
  write: "written",
  fix: "fixed",
  refactor: "refactored",
  create: "created",
  update: "updated",
  remove: "removed",
  delete: "deleted",
  configure: "configured",
  migrate: "migrated",
  build: "built",
  design: "designed",
  test: "tested",
};

/** Special two-word verb prefix. */
const SET_UP_PATTERN = /^set\s+up\s+/i;

function toPastTense(description: string): string {
  const trimmed = description.trim();

  // Handle "Set up X" → "X set up"
  if (SET_UP_PATTERN.test(trimmed)) {
    const rest = trimmed.replace(SET_UP_PATTERN, "");
    return `${rest} set up`;
  }

  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return `${trimmed} — completed`;

  const verb = trimmed.slice(0, spaceIdx).toLowerCase();
  const rest = trimmed.slice(spaceIdx + 1);

  const pastTense = VERB_MAP[verb];
  if (pastTense) {
    return `${rest} ${pastTense}`;
  }

  return `${trimmed} — completed`;
}

export function deriveCurrentState(tasks: CompletedTask[]): string[] {
  if (tasks.length === 0) return [];

  const sorted = [...tasks].sort((a, b) => b.confidence - a.confidence);
  const top = sorted.slice(0, 5);

  return top.map((t) => toPastTense(t.description));
}
