/**
 * Ensures ChromaDB is running. If unreachable, attempts to start it via docker compose.
 */

import { spawn } from "node:child_process";
import { spinner } from "@clack/prompts";

function getChromaUrl(): string {
  const host = process.env.CHROMADB_HOST ?? "localhost";
  const port =
    process.env.CHROMADB_PORT ??
    (process.env.CHROMADB_HOST ? "8000" : "8020");
  return `http://${host}:${port}`;
}

async function chromaReachable(): Promise<boolean> {
  const url = getChromaUrl();
  try {
    const res = await fetch(`${url}/api/v1/heartbeat`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

function getLastNonEmptyLine(input: string): string {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

async function runDockerOutput(args: string[], timeoutMs = 1500): Promise<string> {
  return await new Promise((resolve) => {
    const proc = spawn("docker", args, {
      stdio: "pipe",
      cwd: process.cwd(),
      shell: true,
      env: process.env,
    });

    let output = "";
    let done = false;
    const finish = (value: string) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      finish("");
    }, timeoutMs);

    proc.stdout?.on("data", (d) => {
      output += String(d);
    });
    proc.stderr?.on("data", (d) => {
      output += String(d);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish("");
        return;
      }
      finish(output);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      finish("");
    });
  });
}

async function getLatestChromaLogLine(): Promise<string> {
  const direct = await runDockerOutput(["logs", "--tail", "1", "chromadb"]);
  const directLine = getLastNonEmptyLine(stripAnsi(direct));
  if (directLine) return directLine.slice(0, 100);

  const compose = await runDockerOutput(["compose", "logs", "--tail", "1", "chromadb"]);
  const composeLine = getLastNonEmptyLine(stripAnsi(compose));
  return composeLine.slice(0, 100);
}

export async function ensureChromaDB(
  onStart?: (msg: string) => void
): Promise<void> {
  const url = getChromaUrl();
  if (await chromaReachable()) return;

  const host = process.env.CHROMADB_HOST;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    onStart?.("ChromaDB is configured for a remote host. Start it manually.");
    return;
  }

  const canRenderSpinner = Boolean(process.stdout.isTTY && process.stderr.isTTY);
  const s = canRenderSpinner ? spinner() : null;
  const updateStatus = (msg: string) => {
    if (s) {
      s.message(msg);
      return;
    }
    onStart?.(msg);
  };

  if (s) {
    s.start("Starting ChromaDB container...");
  } else {
    onStart?.(`ChromaDB not reachable at ${url}. Attempting to start via docker compose...`);
  }

  return new Promise((resolve) => {
    const openclawImageFallback = process.env["OPENCLAW_IMAGE"]?.trim()
      ? undefined
      : "openclaw/worker:latest";
    if (openclawImageFallback) {
      updateStatus("OPENCLAW_IMAGE not set. Injecting fallback for docker compose evaluation.");
    }
    const proc = spawn("docker", ["compose", "up", "-d", "chromadb"], {
      stdio: "pipe",
      cwd: process.cwd(),
      shell: true,
      env: {
        ...process.env,
        ...(openclawImageFallback ? { OPENCLAW_IMAGE: openclawImageFallback } : {}),
      },
    });

    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        const reason = `docker compose up chromadb failed (code ${code}). ${stderr.slice(0, 200)}`;
        if (s) s.stop(`⚠️ ${reason}`);
        else onStart?.(reason);
        resolve();
        return;
      }
      updateStatus("Waiting for ChromaDB readiness...");
      const startedAt = Date.now();
      const timeoutMs = 60_000;
      const intervalMs = 2000;
      while (Date.now() - startedAt < timeoutMs) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const elapsed = Date.now() - startedAt;
        const tailLine = await getLatestChromaLogLine();
        if (tailLine) {
          updateStatus(
            `Waiting for ChromaDB readiness... (${elapsed}ms / ${timeoutMs}ms) | ${tailLine}`,
          );
        } else {
          updateStatus(`Waiting for ChromaDB readiness... (${elapsed}ms / ${timeoutMs}ms)`);
        }

        if (await chromaReachable()) {
          if (s) s.stop("✅ ChromaDB is ready!");
          else onStart?.(`ChromaDB ready (elapsed ${elapsed}ms).`);
          resolve();
          return;
        }
      }
      const elapsed = Date.now() - startedAt;
      if (s) {
        s.stop("⚠️ ChromaDB startup timed out. Falling back to JSON.");
      } else {
        onStart?.(
          `ChromaDB did not become ready in time (elapsed ${elapsed}ms). Using JSON fallback. ` +
            `Try: docker compose logs chromadb`,
        );
      }
      resolve();
    });
  });
}
