/**
 * Layer 3 — Component tokens.
 *
 * Aliases from a component-specific name (what a callsite cares about,
 * e.g. "chat.userText") to a semantic token (what the palette provides,
 * e.g. "text.primary"). Components import the `tokens` Proxy from
 * tokens.ts and never see semantic paths directly — this map is the only
 * place that crosses the layer boundary.
 *
 * Adding a new visual element to the UI? Add a row here first, then use
 * it from the component. Never add a new semantic key unless every theme
 * is going to define a value for it.
 */
import type { SemanticPath } from "./semantic-tokens.js";

export const COMPONENT_TO_SEMANTIC = {
  // ── chat (messages.ts: 21 sites) ──────────────────────────────────
  "chat.userPrompt":       "brand.primary",
  "chat.userText":         "text.primary",
  "chat.userPending":      "text.tertiary",
  "chat.agentName":        "text.secondary",
  "chat.systemError":      "status.error",
  "chat.systemSuccess":    "status.success",
  "chat.systemHelp":       "text.secondary",
  "chat.systemDefault":    "text.tertiary",
  "chat.toolInline":       "status.info",
  "chat.toolText":         "text.secondary",
  "chat.toolCountHint":    "text.tertiary",
  "chat.collapseHint":     "text.tertiary",
  "chat.taskBlockedGlyph": "status.error",
  "chat.taskBlockedTail":  "text.tertiary",
  "chat.errorPrefix":      "status.error",

  // ── tree (messages.ts) ────────────────────────────────────────────
  "tree.connector":        "text.tertiary",
  "tree.collapsedMore":    "text.tertiary",
  "tree.thinking":         "text.tertiary",

  // ── tool (tool-call-view.ts: 9 sites) ─────────────────────────────
  "tool.pending":          "status.warning",
  "tool.running":          "status.info",
  "tool.completed":        "status.success",
  "tool.failed":           "status.error",
  "tool.aborted":          "border.subtle",
  "tool.durationLabel":    "text.tertiary",
  "tool.errorSummary":     "status.error",

  // ── diff (tool-call-view.ts) ──────────────────────────────────────
  "diff.add":              "status.success",
  "diff.remove":           "status.error",
  "diff.context":          "text.tertiary",
  "diff.collapsed":        "text.tertiary",

  // ── agent badges (badge.ts: 7 roles + fallback) ───────────────────
  "agent.coder":           "brand.accent",
  "agent.reviewer":        "status.success",
  "agent.planner":         "status.info",
  "agent.tester":          "brand.primary",
  "agent.debugger":        "status.error",
  "agent.researcher":      "status.warning",
  "agent.assistant":       "brand.accent",
  "agent.fallback":        "brand.accent",

  // ── status indicators (status-indicator.ts: 8 sites) ──────────────
  "status.dotActive":      "status.success",
  "status.dotConfigured":  "status.warning",
  "status.dotOffline":     "text.tertiary",
  "status.dotError":       "status.error",
  "status.dotReady":       "status.info",
  "status.dotConnecting":  "text.tertiary",
  "status.spinnerDefault": "status.info",

  // ── status badges (badge.ts) ──────────────────────────────────────
  "badge.success":         "status.success",
  "badge.error":           "status.error",
  "badge.warning":         "status.warning",
  "badge.info":            "status.info",
  "badge.pending":         "text.tertiary",

  // ── inline pickers (interactive-block, /themes) ───────────────────
  "picker.itemSelected":   "brand.primary",
  "picker.itemUnselected": "text.secondary",
  "picker.hint":           "text.tertiary",

  // ── markdown (markdown.ts: 10 sites) ──────────────────────────────
  "md.h1":                 "brand.primary",
  "md.h2":                 "brand.accent",
  "md.h3":                 "text.secondary",
  "md.blockquoteBar":      "border.subtle",
  "md.blockquoteText":     "text.secondary",
  "md.bullet":             "text.tertiary",
  "md.numbered":           "text.tertiary",
  "md.langLabel":          "text.tertiary",
  "md.inlineCode":         "brand.accent",
  "md.bold":               "text.secondary",
  "md.link":               "status.info",
  "md.tableSep":           "text.tertiary",

  // ── panel (panel.ts: 9 sites) ─────────────────────────────────────
  "panel.border":          "border.default",
  "panel.title":           "brand.primary",
  "panel.footer":          "text.tertiary",
  "panel.rowSelected":     "text.primary",
  "panel.rowLabel":        "text.primary",
  "panel.rowLabelDim":     "text.secondary",
  "panel.rowValue":        "text.secondary",
  "panel.rowValueDim":     "text.tertiary",

  // ── editor (editor.ts: 4 sites) ───────────────────────────────────
  "ui.editorBorder":       "border.subtle",
  "ui.editorPrompt":       "brand.primary",
  "ui.placeholder":        "text.tertiary",
  "ui.fileTag":            "status.info",

  // ── welcome (welcome.ts: 11 sites) ────────────────────────────────
  "ui.welcomeTitle":       "brand.primary",
  "ui.welcomeTagline":     "text.secondary",
  "ui.welcomeBorder":      "border.subtle",
  "ui.welcomeExample":     "status.success",
  "ui.welcomeHint":        "text.secondary",

  // ── confirm (confirm.ts: 4 sites) ─────────────────────────────────
  "ui.confirmDanger":      "status.error",
  "ui.confirmWarning":     "status.warning",
  "ui.confirmText":        "text.primary",
  "ui.confirmYes":         "status.success",

  // ── misc primitives ───────────────────────────────────────────────
  "ui.separator":          "border.default",
  "ui.divider":            "border.default",
  "ui.thinking":           "status.info",
  "ui.resumeBanner":       "text.secondary",
  "ui.brandPrimary":       "brand.primary",
  "ui.brandAccent":        "brand.accent",
  "ui.textPrimary":        "text.primary",
  "ui.textSecondary":      "text.secondary",
  "ui.textTertiary":       "text.tertiary",
  "ui.bgElevated":         "bg.elevated",
} as const satisfies Record<string, SemanticPath>;

/** Compile-time-enumerated union of every component-token name. */
export type ComponentPath = keyof typeof COMPONENT_TO_SEMANTIC;

/** All component paths, ordered as declared above. */
export const ALL_COMPONENT_PATHS: readonly ComponentPath[] =
  Object.keys(COMPONENT_TO_SEMANTIC) as ComponentPath[];
