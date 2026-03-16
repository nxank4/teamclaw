export type {
  TaskDiff,
  TaskDiffStatus,
  MetricDiff,
  MemoryDiff,
  RoutingDiff,
  TeamDiff,
  RunDiff,
  DiffChain,
  OverallTrend,
  Trend,
  CrossSessionDiff,
  ConfigDifference,
  TaskSnapshot,
  RunSnapshot,
  TaskMatch,
} from "./types.js";
export { computeRunDiff, extractRunSnapshot } from "./engine.js";
export { matchTasks, tokenize, cosineSimilarity } from "./matcher.js";
export { buildDiffChain, buildPairDiff } from "./chain.js";
export type { ChainOptions } from "./chain.js";
export { renderDiffCli } from "./renderers/cli.js";
export { renderDiffMarkdown, renderLearningProgression } from "./renderers/markdown.js";
