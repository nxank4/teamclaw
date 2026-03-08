/**
 * Step: choose LLM mode (direct Ollama vs LiteLLM gateway).
 * When gateway is selected, prompts for URL, model, and config path with zero-friction defaults.
 */

import React, { useState } from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";

export type LlmGatewayChoice = {
  useGateway: boolean;
  gatewayUrl?: string;
  teamModel?: string;
  llmConfigPath?: string;
};

type Props = {
  onComplete: (choice: LlmGatewayChoice) => void;
};

const MODE_ITEMS = [
  { label: "Direct Ollama only — no gateway", value: "ollama" },
  { label: "LiteLLM gateway (recommended for OpenClaw, cloud models)", value: "gateway" },
];

const DEFAULT_GATEWAY_URL = "http://localhost:4000";
const DEFAULT_TEAM_MODEL = "team-default";
const DEFAULT_CONFIG_PATH = "./llm-config.yaml";

export default function LlmGatewayStep({ onComplete }: Props): React.JSX.Element {
  const [subStep, setSubStep] = useState<"mode" | "url" | "model" | "path">("mode");
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY_URL);
  const [teamModel, setTeamModel] = useState(DEFAULT_TEAM_MODEL);
  const [llmConfigPath, setLlmConfigPath] = useState(DEFAULT_CONFIG_PATH);

  const onModeSelect = (item: { value: string }): void => {
    if (item.value === "gateway") {
      setSubStep("url");
    } else {
      onComplete({ useGateway: false });
    }
  };

  const onUrlSubmit = (value: string): void => {
    const trimmed = value.trim() || DEFAULT_GATEWAY_URL;
    setGatewayUrl(trimmed);
    setSubStep("model");
  };

  const onModelSubmit = (value: string): void => {
    const trimmed = value.trim() || DEFAULT_TEAM_MODEL;
    setTeamModel(trimmed);
    setSubStep("path");
  };

  const onPathSubmit = (value: string): void => {
    const trimmed = value.trim() || DEFAULT_CONFIG_PATH;
    setLlmConfigPath(trimmed);
    onComplete({
      useGateway: true,
      gatewayUrl,
      teamModel,
      llmConfigPath: trimmed,
    });
  };

  if (subStep === "mode") {
    return (
      <Box flexDirection="column">
        <Text>LLM mode:</Text>
        <Text color="gray">  Direct Ollama: TeamClaw talks to Ollama only.</Text>
        <Text color="gray">  LiteLLM: Single gateway for TeamClaw + OpenClaw (cloud models, etc).</Text>
        <Box marginTop={1}>
          <SelectInput items={MODE_ITEMS} onSelect={onModeSelect} />
        </Box>
      </Box>
    );
  }

  if (subStep === "url") {
    return (
      <Box flexDirection="column">
        <Text>Gateway URL (press Enter for default):</Text>
        <Box marginTop={1}>
          <TextInput
            value={gatewayUrl}
            onChange={setGatewayUrl}
            onSubmit={onUrlSubmit}
            placeholder={DEFAULT_GATEWAY_URL}
          />
        </Box>
      </Box>
    );
  }

  if (subStep === "model") {
    return (
      <Box flexDirection="column">
        <Text>Team model name (press Enter for default):</Text>
        <Box marginTop={1}>
          <TextInput
            value={teamModel}
            onChange={setTeamModel}
            onSubmit={onModelSubmit}
            placeholder={DEFAULT_TEAM_MODEL}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>LiteLLM config path (press Enter for default):</Text>
      <Box marginTop={1}>
        <TextInput
          value={llmConfigPath}
          onChange={setLlmConfigPath}
          onSubmit={onPathSubmit}
          placeholder={DEFAULT_CONFIG_PATH}
        />
      </Box>
    </Box>
  );
}
