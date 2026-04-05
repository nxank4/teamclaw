/**
 * First-run orchestrator — detect → setup → config → handoff.
 */

import { Result, ok, err } from "neverthrow";
import type { FirstRunResult, OnboardError } from "./types.js";
import { detectEnvironment } from "./env-detector.js";
import { runSetupWizard } from "./setup-wizard.js";
import { writeInitialConfig } from "./config-writer.js";
import { generateFirstPrompts } from "./first-prompt.js";

/**
 * Handle the first-run flow. Called before TUI starts.
 * Returns config path and suggestions, or error if cancelled.
 */
export async function handleFirstRun(): Promise<Result<FirstRunResult, OnboardError>> {
  // 1. Detect environment (< 3s, all parallel)
  let env;
  try {
    env = await detectEnvironment();
  } catch {
    // Detection failed — create empty environment
    env = {
      nodeVersion: process.version,
      packageManager: null,
      shell: "unknown",
      terminal: "unknown",
      ollama: null,
      lmStudio: null,
      envKeys: [],
      project: { type: null, name: null, path: process.cwd(), hasGit: false },
      hasExistingConfig: false,
      existingConfigValid: false,
    };
  }

  // 2. Existing valid config → skip wizard
  if (env.hasExistingConfig && env.existingConfigValid) {
    return ok({
      configPath: "~/.openpawl/config.json",
      isNewSetup: false,
      isExistingConfig: true,
      environment: env,
      suggestions: generateFirstPrompts(env),
    });
  }

  // 3. Non-interactive check
  if (!process.stdout.isTTY) {
    return err({
      type: "not_interactive",
      message: "OpenPawl setup requires an interactive terminal. " +
        "Create ~/.openpawl/config.json manually to configure.",
    });
  }

  // 4. Run setup wizard
  const wizardResult = await runSetupWizard(env);
  if (wizardResult === null) {
    return err({ type: "cancelled", message: "Setup cancelled" });
  }

  // 5. Special case: reusing existing config
  if (wizardResult.provider === "__existing__") {
    return ok({
      configPath: "~/.openpawl/config.json",
      isNewSetup: false,
      isExistingConfig: true,
      environment: env,
      suggestions: generateFirstPrompts(env),
    });
  }

  // 6. Write config
  const writeResult = await writeInitialConfig({
    provider: wizardResult.provider,
    apiKey: wizardResult.apiKey,
    model: wizardResult.model,
    providerChain: wizardResult.providerChain,
    additionalProviders: wizardResult.additionalProviders,
    projectPath: env.project.path,
  });

  if (writeResult.isErr()) {
    return err(writeResult.error);
  }

  // 7. Return result
  return ok({
    configPath: writeResult.value,
    isNewSetup: true,
    isExistingConfig: false,
    environment: env,
    suggestions: generateFirstPrompts(env),
  });
}
