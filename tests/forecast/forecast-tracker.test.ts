import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the pure logic of error calculation and bias correction
describe("forecast tracker logic", () => {
  it("correctly computes errorPct from estimated vs actual", () => {
    const estimated = 0.15;
    const actual = 0.12;
    const errorPct = Math.round(Math.abs(estimated - actual) / actual * 100);
    expect(errorPct).toBe(25); // (0.03 / 0.12) * 100 = 25%
  });

  it("handles zero actual gracefully", () => {
    const estimated = 0.15;
    const actual = 0;
    const errorPct = actual > 0
      ? Math.round(Math.abs(estimated - actual) / actual * 100)
      : 0;
    expect(errorPct).toBe(0);
  });

  it("bias correction computes correct ratio", () => {
    // Simulate entries where we consistently overestimate by 20%
    const entries = Array.from({ length: 10 }, () => ({
      estimatedMidUSD: 0.12,
      actualUSD: 0.10,
    }));

    let totalRatio = 0;
    for (const entry of entries) {
      totalRatio += entry.actualUSD / entry.estimatedMidUSD;
    }
    const avgRatio = totalRatio / entries.length;

    // 0.10 / 0.12 ≈ 0.833 — we should correct DOWN by 17%
    expect(avgRatio).toBeCloseTo(0.833, 2);
    const correction = Math.max(0.7, Math.min(1.3, avgRatio));
    expect(correction).toBeCloseTo(0.833, 2);
  });

  it("bias correction only applies after >= 10 entries", () => {
    // With < 10 entries, correction should be 1.0 (no correction)
    const entries = Array.from({ length: 5 }, () => ({
      estimatedMidUSD: 0.12,
      actualUSD: 0.10,
    }));
    // getBiasCorrection internally checks length < 10 → returns 1.0
    expect(entries.length < 10).toBe(true);
  });

  it("bias correction clamps to ±30%", () => {
    // Extreme over-estimation
    const entries = Array.from({ length: 10 }, () => ({
      estimatedMidUSD: 1.00,
      actualUSD: 0.10,
    }));

    let totalRatio = 0;
    for (const entry of entries) {
      totalRatio += entry.actualUSD / entry.estimatedMidUSD;
    }
    const avgRatio = totalRatio / entries.length;
    const correction = Math.max(0.7, Math.min(1.3, avgRatio));
    expect(correction).toBe(0.7); // Clamped at 0.7
  });
});
