/**
 * Onboarding type definitions.
 */

export type ProjectType =
  | "node"
  | "rust"
  | "python"
  | "go"
  | "ruby"
  | "java"
  | "dotnet"
  | "unknown";

export interface DetectedEnvironment {
  nodeVersion: string;
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | null;
  shell: string;
  terminal: string;

  ollama: { available: boolean; models: string[]; url: string } | null;
  lmStudio: { available: boolean; models: string[]; url: string } | null;

  envKeys: {
    provider: string;
    envVar: string;
    masked: string;
  }[];

  project: {
    type: ProjectType | null;
    name: string | null;
    path: string;
    hasGit: boolean;
  };

  hasExistingConfig: boolean;
  existingConfigValid: boolean;
}

export interface SetupResult {
  provider: string;
  apiKey?: string;
  model: string;
  providerChain: string[];
  additionalProviders: Array<{
    provider: string;
    apiKey?: string;
    model?: string;
    baseURL?: string;
  }>;
}

export interface PromptSuggestion {
  text: string;
  description: string;
  category: "explore" | "create" | "fix" | "learn";
}

export interface FirstRunResult {
  configPath: string;
  isNewSetup: boolean;
  isExistingConfig: boolean;
  environment: DetectedEnvironment;
  suggestions: PromptSuggestion[];
}

export type OnboardError =
  | { type: "cancelled"; message: string }
  | { type: "config_write_failed"; cause: string }
  | { type: "validation_failed"; cause: string }
  | { type: "not_interactive"; message: string };
