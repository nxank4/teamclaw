/**
 * Success pattern memory — barrel export.
 */

export type {
  SuccessPattern,
  PatternQuality,
  LearningCurve,
  LearningCurveEntry,
  MemoryContext,
} from "./types.js";

export { SuccessPatternStore } from "./store.js";
export { extractSuccessPattern, extractKeywords, buildEmbeddingText } from "./extractor.js";
export type { TaskForExtraction } from "./extractor.js";
export { retrieveSuccessPatterns } from "./retriever.js";
export type { RetrievalOptions } from "./retriever.js";
export { PatternQualityStore, pruneStalePatterns } from "./quality.js";
export { withSuccessContext } from "./prompt.js";
export { LearningCurveStore } from "./learning-curve.js";
