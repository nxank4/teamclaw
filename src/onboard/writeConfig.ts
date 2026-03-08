/**
 * Persist onboarding choices to .env, teamclaw.config.json, and optionally llm-config.yaml.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildLlmConfigYaml } from "./llmConfigGenerator.js";
import type { LlmGatewayChoice } from "./steps/LlmGatewayStep.js";

export function writeConfig(
  workerUrl: string,
  template: string,
  goal: string,
  gateway?: LlmGatewayChoice
): void {
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env");
  const configPath = path.join(cwd, "teamclaw.config.json");

  let envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const openclawLine = `OPENCLAW_WORKER_URL=${workerUrl}`;

  if (/OPENCLAW_WORKER_URL=/.test(envContent)) {
    envContent = envContent.replace(/OPENCLAW_WORKER_URL=.*/m, openclawLine);
  } else {
    envContent = envContent.trimEnd();
    if (envContent && !envContent.endsWith("\n")) envContent += "\n";
    envContent += `\n# OpenClaw Workers\n${openclawLine}\n`;
  }

  if (gateway?.useGateway && gateway.gatewayUrl && gateway.teamModel && gateway.llmConfigPath) {
    const repl = (key: string, val: string) => {
      const re = new RegExp(`${key}=[^\n]*`, "m");
      if (re.test(envContent)) {
        envContent = envContent.replace(re, `${key}=${val}`);
      } else {
        envContent = envContent.trimEnd();
        if (envContent && !envContent.endsWith("\n")) envContent += "\n";
        if (!envContent.includes("GATEWAY_URL=")) {
          envContent += `\n# AI Gateway (LiteLLM) — TeamClaw and OpenClaw use this instead of direct Ollama\n`;
        }
        envContent += `${key}=${val}\n`;
      }
    };
    repl("GATEWAY_URL", gateway.gatewayUrl);
    repl("TEAM_MODEL", gateway.teamModel);
    repl("LITELLM_CONFIG_PATH", gateway.llmConfigPath);

    const llmConfigAbsPath = path.isAbsolute(gateway.llmConfigPath)
      ? gateway.llmConfigPath
      : path.join(cwd, gateway.llmConfigPath);
    if (!existsSync(llmConfigAbsPath)) {
      const yaml = buildLlmConfigYaml({
        teamModelName: gateway.teamModel,
        includeCloudModels: true,
      });
      writeFileSync(llmConfigAbsPath, yaml, "utf-8");
    }
  }

  writeFileSync(envPath, envContent, "utf-8");

  const config: Record<string, unknown> = {
    template,
  };
  if (goal) config.goal = goal;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
