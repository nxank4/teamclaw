/**
 * Public surface for the crew manifest subsystem.
 */

export * from "./types.js";
export {
  MANIFEST_FILENAME,
  DEFAULT_MODEL_SENTINEL,
  ManifestModelError,
  loadManifestFromDir,
  loadUserCrew,
  listUserCrewNames,
  resolveModelSentinels,
  userCrewDir,
  userCrewsDir,
} from "./loader.js";
export type { LoadManifestOptions } from "./loader.js";
export { validateManifest } from "./validator.js";
export type { ValidationIssue, ValidationResult } from "./validator.js";
export {
  BUILT_IN_PRESETS,
  FULL_STACK_PRESET,
  builtInPresetsDir,
  builtInPresetDir,
  ensureBuiltInPresets,
} from "./presets.js";
export type { PresetSeedResult } from "./presets.js";
