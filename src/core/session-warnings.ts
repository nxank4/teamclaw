/**
 * Collects warnings during a work session for end-of-run summary.
 * Cleared at session start; read by work-runner after orchestration completes.
 */

const warnings: string[] = [];

export function pushSessionWarning(msg: string): void {
  if (!warnings.includes(msg)) warnings.push(msg);
}

export function getSessionWarnings(): string[] {
  return [...warnings];
}

export function clearSessionWarnings(): void {
  warnings.length = 0;
}
