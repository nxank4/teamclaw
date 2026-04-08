/**
 * Token budget manager — ensures context never exceeds model window.
 */

export interface ContextBudget {
  totalTokens: number;
  reservedForResponse: number;
  reservedForTools: number;
  reservedForSystem: number;
  availableForHistory: number;
  currentHistoryTokens: number;
  utilizationPercent: number;
  compressionNeeded: boolean;
}

export type CompressionLevel = "none" | "light" | "aggressive" | "emergency" | "overflow";

export class ContextBudgetManager {
  private modelContextSize: number;
  private responseReserve: number;
  private compressionThreshold: number;
  private minHistoryMessages: number;

  constructor(modelContextSize: number, config?: {
    responseReserve?: number;
    compressionThreshold?: number;
    minHistoryMessages?: number;
  }) {
    this.modelContextSize = modelContextSize;
    this.responseReserve = config?.responseReserve ?? 4096;
    this.compressionThreshold = config?.compressionThreshold ?? 0.80;
    this.minHistoryMessages = config?.minHistoryMessages ?? 4;
  }

  calculateBudget(systemPromptTokens: number, toolSchemaTokens: number, historyTokens: number): ContextBudget {
    const reserved = this.responseReserve + systemPromptTokens + toolSchemaTokens;
    const available = Math.max(0, this.modelContextSize - reserved);
    const utilization = available > 0 ? historyTokens / available : 1;

    return {
      totalTokens: this.modelContextSize,
      reservedForResponse: this.responseReserve,
      reservedForTools: toolSchemaTokens,
      reservedForSystem: systemPromptTokens,
      availableForHistory: available,
      currentHistoryTokens: historyTokens,
      utilizationPercent: Math.round(utilization * 100),
      compressionNeeded: utilization > this.compressionThreshold,
    };
  }

  getCompressionLevel(budget: ContextBudget): CompressionLevel {
    const util = budget.utilizationPercent;
    if (util > 100) return "overflow";
    if (util > 90) return "emergency";
    if (util > 80) return "aggressive";
    if (util > 60) return "light";
    return "none";
  }

  getMemoryBudget(budget: ContextBudget): number {
    const remaining = budget.availableForHistory - budget.currentHistoryTokens;
    return Math.max(0, Math.floor(remaining * 0.3)); // 30% of remaining for memory
  }

  getFileBudget(budget: ContextBudget): number {
    const remaining = budget.availableForHistory - budget.currentHistoryTokens;
    return Math.max(0, Math.floor(remaining * 0.2)); // 20% of remaining for files
  }
}
