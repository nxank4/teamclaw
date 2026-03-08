#!/usr/bin/env node
/**
 * TeamClaw onboarding wizard — interactive setup for OpenClaw worker and team.
 */

import { render } from "ink";
import App from "./App.js";

export async function runOnboard(): Promise<void> {
  const instance = render(<App />);
  await instance.waitUntilExit();
}

const isMain = process.argv[1]?.endsWith("onboard.js") ?? false;
if (isMain) {
  runOnboard().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
