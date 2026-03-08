/**
 * Generates LiteLLM config YAML for onboarding.
 * Used only from onboarding; does not touch runtime code.
 */

export interface LlmConfigOptions {
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  teamModelName?: string;
  includeCloudModels?: boolean;
}

const DEFAULT_OLLAMA_BASE = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen3.5:2b";
const DEFAULT_TEAM_MODEL = "team-default";

export function buildLlmConfigYaml(opts: LlmConfigOptions = {}): string {
  const ollamaBase = opts.ollamaBaseUrl?.trim() || DEFAULT_OLLAMA_BASE;
  const ollamaModel = opts.ollamaModel?.trim() || DEFAULT_OLLAMA_MODEL;
  const teamModel = opts.teamModelName?.trim() || DEFAULT_TEAM_MODEL;
  const includeCloud = opts.includeCloudModels ?? false;

  const ollamaEntry = `  - model_name: ${teamModel}
    litellm_params:
      model: ollama/${ollamaModel}
      api_base: ${ollamaBase}
`;

  const cloudBlock = includeCloud
    ? `
  # Optional cloud models (uncomment and set env vars):
  # - model_name: gpt-4o
  #   litellm_params:
  #     model: openai/gpt-4o
  #     api_key: os.environ/OPENAI_API_KEY
  # - model_name: claude-haiku
  #   litellm_params:
  #     model: anthropic/claude-3-haiku-20240307
  #     api_key: os.environ/ANTHROPIC_API_KEY
  # - model_name: gemini-flash
  #   litellm_params:
  #     model: gemini/gemini-1.5-flash
  #     api_key: os.environ/GEMINI_API_KEY
`
    : "";

  return `# TeamClaw LiteLLM Gateway – single config for TeamClaw + OpenClaw.
# Run: teamclaw gateway start  (or docker compose --profile gateway up)
# Then set GATEWAY_URL=http://localhost:4000 and TEAM_MODEL=${teamModel} in .env

model_list:
${ollamaEntry}${cloudBlock}# general_settings:
#   master_key: os.environ/LITELLM_MASTER_KEY  # optional; omit for local-only
`;
}
