/**
 * Memory Retrieval Node - Retrieves relevant memories from LanceDB before Sprint Planning.
 */

import type { GraphState } from "../core/graph-state.js";
import type { VectorMemory } from "../core/knowledge-base.js";
import type { HttpEmbeddingFunction } from "../core/knowledge-base.js";
import type { SuccessPatternStore } from "../memory/success/store.js";
import { retrieveSuccessPatterns } from "../memory/success/retriever.js";
import { logger, isDebugMode } from "../core/logger.js";

function log(msg: string): void {
  if (isDebugMode()) {
    logger.agent(msg);
  }
}

export class MemoryRetrievalNode {
  private readonly vectorMemory: VectorMemory;
  private readonly maxRetroActions: number;
  private readonly maxProjectMemories: number;
  private readonly successStore: SuccessPatternStore | null;
  private readonly embedder: HttpEmbeddingFunction | null;

  constructor(
    vectorMemory: VectorMemory,
    maxRetroActions = 5,
    maxProjectMemories = 2,
    successStore: SuccessPatternStore | null = null,
    embedder: HttpEmbeddingFunction | null = null,
  ) {
    this.vectorMemory = vectorMemory;
    this.maxRetroActions = maxRetroActions;
    this.maxProjectMemories = maxProjectMemories;
    this.successStore = successStore;
    this.embedder = embedder;
    log(`MemoryRetrievalNode initialized (maxActions: ${maxRetroActions}, maxProjects: ${maxProjectMemories}, successStore: ${!!successStore})`);
  }

  async retrieveMemories(state: GraphState): Promise<Partial<GraphState>> {
    const userGoal = state.user_goal;

    if (!userGoal) {
      return {
        retrieved_memories: "",
        preferences_context: "",
        messages: [],
        last_action: "No user goal provided, skipping memory retrieval",
        __node__: "memory_retrieval",
      };
    }

    log(`Retrieving memories for goal: ${userGoal.slice(0, 50)}...`);

    try {
      const [retroActions, projectMemories] = await Promise.all([
        this.vectorMemory.retrieveRelevantRetroActions(userGoal, this.maxRetroActions),
        this.vectorMemory.retrieveRelevantMemories(userGoal, this.maxProjectMemories),
      ]);

      // Retrieve success patterns if store is available
      const successPatterns = this.successStore && this.embedder
        ? await retrieveSuccessPatterns(this.successStore, this.embedder, userGoal)
        : [];

      const memoriesLines: string[] = [];

      if (retroActions.length > 0) {
        memoriesLines.push("## User Preferences from Past Projects:");
        for (const action of retroActions) {
          const priority = (action.metadata.priority_score as number) ?? 1;
          const category = (action.metadata.category as string) ?? "general";
          const priorityTag = priority >= 10 ? " [HIGH PRIORITY]" : "";
          memoriesLines.push(`- ${action.text} (category: ${category})${priorityTag}`);
        }
      }

      if (projectMemories.length > 0) {
        memoriesLines.push("\n## Past Project Context:");
        for (const memory of projectMemories) {
          memoriesLines.push(`- ${memory}`);
        }
      }

      if (successPatterns.length > 0) {
        memoriesLines.push("\n## Proven Approaches from Past Successes:");
        for (const pattern of successPatterns) {
          const conf = Math.round(pattern.confidence * 100);
          memoriesLines.push(`- Task: "${pattern.taskDescription.slice(0, 60)}" | Approach: ${pattern.approach.slice(0, 100)} | Confidence: ${conf}%`);
        }
      }

      const preferencesContext = memoriesLines.join("\n");
      const summaryMsg = `Retrieved ${retroActions.length} preferences, ${projectMemories.length} project memories, and ${successPatterns.length} success patterns`;

      if (retroActions.length > 0 || projectMemories.length > 0 || successPatterns.length > 0) {
        log(`${summaryMsg}. Context length: ${preferencesContext.length} chars`);
      }

      return {
        retrieved_memories: preferencesContext,
        preferences_context: preferencesContext,
        memory_context: {
          failureLessons: retroActions.map((a) => a.text),
          successPatterns,
          relevanceScores: [],
        },
        messages: [summaryMsg],
        last_action: "Memory retrieval complete",
        __node__: "memory_retrieval",
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Memory retrieval failed: ${errMsg}`);
      return {
        retrieved_memories: "",
        preferences_context: "",
        messages: ["Memory retrieval failed, proceeding without past context"],
        last_action: "Memory retrieval failed",
        __node__: "memory_retrieval",
      };
    }
  }
}

export function createMemoryRetrievalNode(
  vectorMemory: VectorMemory,
  maxRetroActions = 5,
  maxProjectMemories = 2,
  successStore: SuccessPatternStore | null = null,
  embedder: HttpEmbeddingFunction | null = null,
): (state: GraphState) => Promise<Partial<GraphState>> {
  const node = new MemoryRetrievalNode(vectorMemory, maxRetroActions, maxProjectMemories, successStore, embedder);
  return (state: GraphState) => node.retrieveMemories(state);
}
