#!/usr/bin/env node
/**
 * TeamClaw CLI entry point.
 * Commands: work, web, check, onboard, gateway
 */

import { runWork } from "./work-runner.js";
import { runWorkWithWeb } from "./work-with-web.js";
import { runWeb } from "./web/server.js";
import { runCheck } from "./check.js";
import { runGateway } from "./core/gateway.js";

function parseGatewayArgs(args: string[]): { port?: number; config?: string } {
  const out: { port?: number; config?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
      out.port = parseInt(args[i + 1], 10) || 4000;
      i++;
    } else if ((args[i] === "--config" || args[i] === "-c") && args[i + 1]) {
      out.config = args[i + 1];
      i++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "work";

  if (cmd === "work") {
    if (args.includes("--web")) {
      await runWorkWithWeb(args.filter((a) => a !== "--web"));
    } else {
      await runWork(args.slice(1));
    }
  } else if (cmd === "web") {
    await runWeb(args.slice(1));
  } else if (cmd === "check") {
    await runCheck(args.slice(1));
  } else if (cmd === "gateway") {
    const sub = args[1] ?? "start";
    if (sub === "start") {
      const { port, config } = parseGatewayArgs(args.slice(2));
      await runGateway({ port, configPath: config }).catch((err) => {
        console.error(err.message ?? err);
        process.exit(1);
      });
    } else {
      console.error(`Unknown subcommand: gateway ${sub}`);
      console.error("Usage: teamclaw gateway start [--port 4000] [--config path/to/llm-config.yaml]");
      process.exit(1);
    }
  } else if (cmd === "onboard") {
    const { runOnboard } = await import("./onboard/index.js");
    await runOnboard();
  } else if (cmd === "lessons") {
    const { runLessonsExport } = await import("./lessons-export.js");
    await runLessonsExport(args.slice(1));
  } else {
    console.error(`Unknown command: ${cmd}`);
    console.error("Usage: teamclaw work | web | check | onboard | gateway | lessons");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
