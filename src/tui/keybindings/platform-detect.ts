/**
 * Platform-specific key mappings — handles macOS/Linux/Windows differences.
 * Cached at startup.
 */

export type Platform = "macos" | "linux" | "windows";

let cachedPlatform: Platform | null = null;

export function detectPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;
  switch (process.platform) {
    case "darwin": cachedPlatform = "macos"; break;
    case "win32": cachedPlatform = "windows"; break;
    default: cachedPlatform = "linux"; break;
  }
  return cachedPlatform;
}

/** Display a key combo using platform-appropriate symbols. */
export function displayKey(combo: string, platform?: Platform): string {
  const p = platform ?? detectPlatform();
  if (p === "macos") {
    return combo
      .replace(/\bmeta\b/gi, "⌘")
      .replace(/\balt\b/gi, "⌥")
      .replace(/\bctrl\b/gi, "⌃")
      .replace(/\bshift\b/gi, "⇧")
      .replace(/\btab\b/gi, "⇥")
      .replace(/\benter\b/gi, "⏎")
      .replace(/\bescape\b/gi, "⎋")
      .replace(/\+/g, "");
  }
  // Linux/Windows: use readable names
  return combo
    .split("+")
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join("+");
}

/** Get platform-specific fallback bindings for keys that vary. */
export function getPlatformFallbacks(platform?: Platform): Record<string, string> {
  const p = platform ?? detectPlatform();
  const fallbacks: Record<string, string> = {};

  if (p === "windows") {
    // Shift+Tab may not work on older Windows terminals; Alt+M as fallback
    fallbacks["alt+m"] = "mode.cycle";
  }

  return fallbacks;
}

/** Get the appropriate multiline-input binding for this platform. */
export function getMultilineKey(platform?: Platform): string {
  const p = platform ?? detectPlatform();
  return p === "macos" ? "alt+enter" : "shift+enter";
}
