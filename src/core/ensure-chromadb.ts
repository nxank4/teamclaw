/**
 * Ensures ChromaDB is running. If unreachable, attempts to start it via docker compose.
 */

import { spawn } from "node:child_process";

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

export async function ensureChromaDB(
  onStart?: (msg: string) => void
): Promise<void> {
  if (await chromaReachable()) return;

  const host = process.env.CHROMADB_HOST;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    onStart?.("ChromaDB is configured for a remote host. Start it manually.");
    return;
  }

  onStart?.("ChromaDB not reachable. Attempting to start via docker compose...");

  return new Promise((resolve) => {
    const proc = spawn("docker", ["compose", "up", "-d", "chromadb"], {
      stdio: "pipe",
      cwd: process.cwd(),
      shell: true,
    });

    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        onStart?.(`docker compose up chromadb failed (code ${code}). ${stderr.slice(0, 200)}`);
        resolve();
        return;
      }
      onStart?.("ChromaDB container started. Waiting for readiness...");
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (await chromaReachable()) {
          onStart?.("ChromaDB ready.");
          resolve();
          return;
        }
      }
      onStart?.("ChromaDB did not become ready in time. Using JSON fallback.");
      resolve();
    });
  });
}
