/**
 * Onboarding module — first-run experience.
 *
 * @deprecated The old TeamClaw onboarding (runOnboard) is replaced by
 * handleFirstRun(). The old runSetup() from src/commands/setup.ts
 * still works for `openpawl setup` but the new flow is simpler.
 */

// New onboarding system
export type {
  DetectedEnvironment,
  ProjectType,
  SetupResult,
  PromptSuggestion,
  FirstRunResult,
  OnboardError,
} from "./types.js";

export { detectEnvironment, maskApiKey } from "./env-detector.js";
export { runSetupWizard } from "./setup-wizard.js";
export { writeInitialConfig, mergeIntoExistingConfig } from "./config-writer.js";
export { generateFirstPrompts } from "./first-prompt.js";
export { handleFirstRun } from "./first-run.js";

// Legacy re-export for backward compatibility
export { runOnboard } from "./legacy.js";
