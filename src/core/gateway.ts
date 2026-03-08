/**
 * LiteLLM gateway - spawn and manage the proxy process for terminal-first deployment.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface GatewayOptions {
  port?: number;
  configPath?: string;
  host?: string;
}

const DEFAULT_PORT = 4000;
const DEFAULT_CONFIG = "llm-config.yaml";

function resolveConfigPath(customPath: string | undefined): string {
  if (customPath?.trim()) {
    const p = path.join(process.cwd(), customPath);
    if (existsSync(p)) return p;
    if (existsSync(customPath)) return customPath;
    return p;
  }
  const cwd = path.join(process.cwd(), DEFAULT_CONFIG);
  const envPath = process.env["LITELLM_CONFIG_PATH"];
  if (envPath?.trim() && existsSync(envPath)) return envPath;
  if (existsSync(cwd)) return cwd;
  return cwd;
}

export function startGateway(options: GatewayOptions = {}): Promise<ChildProcess> {
  const port = options.port ?? Number(process.env["LITELLM_PORT"]) ?? DEFAULT_PORT;
  const host = options.host ?? "127.0.0.1";
  const configPath = resolveConfigPath(options.configPath ?? process.env["LITELLM_CONFIG_PATH"]);

  if (!existsSync(configPath)) {
    const err = new Error(
      `LiteLLM config not found at ${configPath}. Create llm-config.yaml or set LITELLM_CONFIG_PATH.`
    );
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    const args = ["--config", configPath, "--port", String(port), "--host", host];
    const child = spawn("litellm", args, {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, LITELLM_CONFIG_PATH: configPath },
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "litellm not found. Install with: pip install litellm  or  uv run litellm (from project with litellm)."
          )
        );
      } else {
        reject(err);
      }
    });

    child.on("spawn", () => {
      console.log(`LiteLLM gateway starting at http://${host}:${port} (config: ${configPath}). Ctrl+C to stop.`);
      resolve(child);
    });
  });
}

export function runGateway(options: GatewayOptions = {}): Promise<void> {
  return startGateway(options).then((child) => {
    return new Promise<void>((resolve, reject) => {
      const shutdown = (signal: string) => {
        console.log(`\n${signal} received, stopping gateway...`);
        child.kill(signal as NodeJS.Signals);
        resolve();
        process.exit(0);
      };
      process.on("SIGINT", () => shutdown("SIGINT"));
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      child.on("exit", (code) => {
        if (code !== null && code !== 0) reject(new Error(`LiteLLM exited with code ${code}`));
        else resolve();
      });
      child.on("error", reject);
    });
  });
}
