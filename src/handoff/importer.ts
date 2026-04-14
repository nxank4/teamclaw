import { readFile } from "node:fs/promises";
import { DecisionStore } from "../journal/store.js";

export interface ParsedContext {
  sessionId: string;
  projectPath: string;
  currentState: string[];
  decisions: Array<{ decision: string; reasoning: string; recommendedBy: string }>;
  leftToDo: string[];
  teamPerformance: never[];
}

/** Extract text between two section headers (## ...), or from header to end. */
function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^## ${heading}\\b[^\\n]*\\n`, "m");
  const match = pattern.exec(content);
  if (!match) return "";
  const start = match.index + match[0].length;
  const nextSection = content.indexOf("\n## ", start);
  return nextSection === -1 ? content.slice(start) : content.slice(start, nextSection);
}

export function parseContextMarkdown(content: string): ParsedContext {
  // Header fields
  const sessionMatch = content.match(/\*\*Session:\*\*\s*(.+)/);
  const projectMatch = content.match(/\*\*Project:\*\*\s*(.+)/);

  // Current state bullets
  const whereSection = extractSection(content, "Where We Are");
  const currentState: string[] = [];
  for (const m of whereSection.matchAll(/^- (.+)$/gm)) {
    currentState.push(m[1].trim());
  }

  // Active decisions
  const decisionSection = extractSection(content, "Active Decisions");
  const decisions: ParsedContext["decisions"] = [];
  const decisionPattern = /^\d+\.\s+\*\*(.+?)\*\*\s*\((\w+),.*?\)\s*\n\s+Reasoning:\s*"(.+?)"/gm;
  for (const m of decisionSection.matchAll(decisionPattern)) {
    decisions.push({
      decision: m[1],
      recommendedBy: m[2],
      reasoning: m[3],
    });
  }

  // Left to do
  const todoSection = extractSection(content, "Left To Do");
  const leftToDo: string[] = [];
  for (const m of todoSection.matchAll(/^- \[[ x]\]\s+(.+)$/gm)) {
    leftToDo.push(m[1].trim());
  }

  return {
    sessionId: sessionMatch ? sessionMatch[1].trim() : "",
    projectPath: projectMatch ? projectMatch[1].trim() : "",
    currentState,
    decisions,
    leftToDo,
    teamPerformance: [] as never[],
  };
}

/** Normalized substring matching for decision deduplication. */
export function isDuplicateDecision(
  newDecision: string,
  existingDecisions: Array<{ decision: string }>,
): boolean {
  const normalized = newDecision.toLowerCase().trim();
  return existingDecisions.some((d) => {
    const existing = d.decision.toLowerCase().trim();
    return existing.includes(normalized) || normalized.includes(existing);
  });
}

/** Reads a CONTEXT.md file and imports decisions into DecisionStore. Best-effort. */
export async function importContextFile(
  contextPath: string,
): Promise<{ imported: number; skipped: number; currentState: string[]; leftToDo: string[] } | null> {
  try {
    const content = await readFile(contextPath, "utf-8");
    const parsed = parseContextMarkdown(content);

    let imported = 0;
    let skipped = 0;

    try {
      const store = new DecisionStore();
      const existing = await store.getAll();

      for (const d of parsed.decisions) {
        if (isDuplicateDecision(d.decision, existing)) {
          skipped++;
          continue;
        }
        const decision = {
          id: `imported_${Date.now()}_${imported}`,
          sessionId: parsed.sessionId,
          runIndex: 0,
          capturedAt: Date.now(),
          topic: d.decision,
          decision: d.decision,
          reasoning: d.reasoning,
          recommendedBy: d.recommendedBy,
          confidence: 0.8,
          taskId: "",
          goalContext: "",
          tags: ["imported"],
          embedding: [],
          status: "active" as const,
        };
        await store.upsert(decision);
        imported++;
      }
    } catch {
      // Best-effort: DecisionStore may not be initialized on fresh installs
    }

    return {
      imported,
      skipped,
      currentState: parsed.currentState,
      leftToDo: parsed.leftToDo,
    };
  } catch {
    return null;
  }
}
