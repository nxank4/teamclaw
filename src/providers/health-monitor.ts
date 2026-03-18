/**
 * Background health monitor for stream providers.
 *
 * Pings providers periodically. After 2 consecutive failures, marks a provider
 * as unavailable. 1 successful ping restores availability.
 *
 * Each provider handles its own health check logic internally.
 */

import type { StreamProvider } from "./provider.js";
import { logger } from "../core/logger.js";

const DEFAULT_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 2;

export class HealthMonitor {
  private readonly providers: StreamProvider[];
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failureCounts = new Map<string, number>();

  constructor(providers: StreamProvider[], intervalMs = DEFAULT_INTERVAL_MS) {
    this.providers = providers;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.checkAll();
    }, this.intervalMs);

    // Never block process exit
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetAll(): void {
    this.failureCounts.clear();
    for (const provider of this.providers) {
      provider.setAvailable(true);
    }
  }

  private async checkAll(): Promise<void> {
    for (const provider of this.providers) {
      try {
        const healthy = await provider.healthCheck();
        if (healthy) {
          const prev = this.failureCounts.get(provider.name) ?? 0;
          this.failureCounts.set(provider.name, 0);
          if (prev >= FAILURE_THRESHOLD) {
            logger.info(`[health] ${provider.name} recovered`);
            provider.setAvailable(true);
          }
        } else {
          this.recordFailure(provider);
        }
      } catch {
        this.recordFailure(provider);
      }
    }
  }

  private recordFailure(provider: StreamProvider): void {
    const count = (this.failureCounts.get(provider.name) ?? 0) + 1;
    this.failureCounts.set(provider.name, count);
    if (count >= FAILURE_THRESHOLD) {
      logger.warn(`[health] ${provider.name} marked unavailable (${count} consecutive failures)`);
      provider.setAvailable(false);
    }
  }

  /** Expose for testing */
  getFailureCount(name: string): number {
    return this.failureCounts.get(name) ?? 0;
  }
}
