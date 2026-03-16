export type {
  AuditTrail,
  AuditSummary,
  DecisionEntry,
  ApprovalEntry,
  CostEntry,
  MemoryUsageEntry,
  AgentPerformanceEntry,
  AuditSectionConfig,
  AuditConfig,
  MultiRunSummary,
} from "./types.js";
export { DEFAULT_AUDIT_CONFIG } from "./types.js";
export { buildAuditTrail } from "./builder.js";
export { renderAuditMarkdown, renderMultiRunSummary } from "./renderers/markdown.js";
export { renderAuditPDF } from "./renderers/pdf.js";
export type { RenderOptions } from "./renderers/types.js";
export { DEFAULT_RENDER_OPTIONS } from "./renderers/types.js";
export { renderLearningProgression } from "../diff/renderers/markdown.js";
