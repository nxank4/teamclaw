/**
 * Legacy onboarding entry — delegates to old setup wizard.
 * @deprecated Use handleFirstRun() from first-run.ts instead.
 */

import { runSetup } from "../commands/setup.js";

export interface RunOnboardOptions {
  installDaemon?: boolean;
}

export async function runOnboard(_options?: RunOnboardOptions): Promise<void> {
  await runSetup();
}
