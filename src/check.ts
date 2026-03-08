/**
 * TeamClaw check - verify OpenClaw worker connectivity.
 */

import { buildTeamFromTemplate } from "./core/team-templates.js";
import { getWorkerUrlsForTeam } from "./core/config.js";

async function pingWorker(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runCheck(_args: string[]): Promise<void> {
  const team = buildTeamFromTemplate("game_dev");
  const workerUrls = getWorkerUrlsForTeam(team.map((b) => b.id));

  console.log("TeamClaw connectivity check\n");

  if (Object.keys(workerUrls).length === 0) {
    console.log("No OpenClaw workers configured.");
    console.log("Set OPENCLAW_WORKER_URL in .env to use OpenClaw.");
    console.log("Without it, TeamClaw uses Ollama (MockSparki) for local dev.");
    return;
  }

  const urls = [...new Set(Object.values(workerUrls))];
  let ok = 0;
  for (const url of urls) {
    const reachable = await pingWorker(url);
    console.log(`${reachable ? "\u2713" : "\u2717"} ${url}`);
    if (reachable) ok++;
  }

  console.log("");
  if (ok === urls.length) {
    console.log(`All ${urls.length} worker(s) reachable.`);
  } else {
    console.log(`${ok}/${urls.length} worker(s) reachable.`);
    process.exit(1);
  }
}
