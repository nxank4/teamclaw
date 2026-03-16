/**
 * Forecast accuracy tracking — compares forecast vs actual after each run.
 * Stores in JSON for portability. Supports bias correction.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ForecastAccuracyEntry } from "./types.js";

const STORE_DIR = path.join(os.homedir(), ".teamclaw", "memory");
const STORE_FILE = path.join(STORE_DIR, "forecast-accuracy.json");
const MIN_ENTRIES_FOR_BIAS = 10;

function ensureDir(): void {
  mkdirSync(STORE_DIR, { recursive: true });
}

function readStore(): ForecastAccuracyEntry[] {
  if (!existsSync(STORE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as ForecastAccuracyEntry[];
  } catch {
    return [];
  }
}

function writeStore(entries: ForecastAccuracyEntry[]): void {
  ensureDir();
  writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/** Record a forecast accuracy entry after a run completes. */
export function recordAccuracy(
  sessionId: string,
  forecastMethod: string,
  estimatedMidUSD: number,
  actualUSD: number,
  similarRunsUsed: number,
): void {
  try {
    const entries = readStore();
    const errorPct = actualUSD > 0
      ? Math.round(Math.abs(estimatedMidUSD - actualUSD) / actualUSD * 100)
      : 0;

    entries.push({
      sessionId,
      forecastMethod,
      estimatedMidUSD,
      actualUSD,
      errorPct,
      similarRunsUsed,
      recordedAt: Date.now(),
    });

    writeStore(entries);
  } catch {
    // Never block
  }
}

/** Get all accuracy entries. */
export function getAccuracyHistory(): ForecastAccuracyEntry[] {
  return readStore();
}

/** Get accuracy entries for a specific method. */
export function getAccuracyByMethod(method: string): ForecastAccuracyEntry[] {
  return readStore().filter((e) => e.forecastMethod === method);
}

/**
 * Compute bias correction factor for a forecast method.
 * Returns a multiplier: < 1 means forecasts tend to overestimate,
 * > 1 means forecasts tend to underestimate.
 *
 * Only applies after >= 10 entries to avoid premature correction.
 */
export function getBiasCorrection(method: string): number {
  const entries = readStore().filter((e) => e.forecastMethod === method);
  if (entries.length < MIN_ENTRIES_FOR_BIAS) return 1.0;

  // Use last 10 entries
  const recent = entries.slice(-10);
  let totalRatio = 0;

  for (const entry of recent) {
    if (entry.estimatedMidUSD > 0) {
      totalRatio += entry.actualUSD / entry.estimatedMidUSD;
    }
  }

  const avgRatio = totalRatio / recent.length;

  // Clamp correction to ±30%
  return Math.max(0.7, Math.min(1.3, avgRatio));
}

/** Get summary stats for display. */
export function getAccuracyStats(): {
  totalForecasts: number;
  avgErrorPct: number;
  byMethod: { method: string; count: number; avgErrorPct: number }[];
} {
  const entries = readStore();
  if (entries.length === 0) {
    return { totalForecasts: 0, avgErrorPct: 0, byMethod: [] };
  }

  const totalError = entries.reduce((sum, e) => sum + e.errorPct, 0);
  const avgError = Math.round(totalError / entries.length);

  const methodMap = new Map<string, { count: number; totalError: number }>();
  for (const e of entries) {
    const existing = methodMap.get(e.forecastMethod) ?? { count: 0, totalError: 0 };
    existing.count++;
    existing.totalError += e.errorPct;
    methodMap.set(e.forecastMethod, existing);
  }

  const byMethod = Array.from(methodMap.entries()).map(([method, data]) => ({
    method,
    count: data.count,
    avgErrorPct: Math.round(data.totalError / data.count),
  }));

  return { totalForecasts: entries.length, avgErrorPct: avgError, byMethod };
}
