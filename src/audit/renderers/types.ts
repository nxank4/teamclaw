/**
 * Render options for audit trail export.
 */

import type { AuditSectionConfig } from "../types.js";

export interface RenderOptions {
  sections: AuditSectionConfig;
  includePrompts: boolean;
  promptMaxLength: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  sections: {
    decisionLog: true,
    approvalHistory: true,
    costBreakdown: true,
    memoryUsage: true,
    agentPerformance: true,
    rawPrompts: false,
  },
  includePrompts: false,
  promptMaxLength: 2000,
};
