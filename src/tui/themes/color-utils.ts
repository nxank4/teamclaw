/**
 * Color utilities — hex conversion, NO_COLOR handling, contrast checking.
 */

import { rgb } from "../core/ansi.js";

export function hexToChalk(hex: string): (text: string) => string {
  if (!isColorSupported()) return noColor;
  const { r, g, b: blue } = hexToRgb(hex);
  return rgb(r, g, blue);
}

export function noColor(text: string): string {
  return text;
}

export function isColorSupported(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return true;
  if (typeof process.stdout.isTTY !== "undefined" && !process.stdout.isTTY) return false;
  return true;
}

export function isValidHex(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

export function contrastRatio(fg: string, bg: string): number {
  const fgLum = relativeLuminance(hexToRgb(fg));
  const bgLum = relativeLuminance(hexToRgb(bg));
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWCAGAA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 4.5;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0]! + clean[0]!, 16),
      g: parseInt(clean[1]! + clean[1]!, 16),
      b: parseInt(clean[2]! + clean[2]!, 16),
    };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const sRGB = [c.r / 255, c.g / 255, c.b / 255].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * sRGB[0]! + 0.7152 * sRGB[1]! + 0.0722 * sRGB[2]!;
}
