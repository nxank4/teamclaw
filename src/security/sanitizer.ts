/**
 * Sanitize external content before context injection.
 */

import type { ContentSource, InjectionAlert } from "./types.js";
import { redactCredentials } from "../credentials/masking.js";

// ANSI escape code pattern
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
// Control characters (except \n \t \r)
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export class ContentSanitizer {
  sanitize(content: string, source: ContentSource, alerts: InjectionAlert[]): string {
    // Never sanitize user input
    if (source === "user") return content;

    let result = content;

    // Remove detected injection patterns
    for (const alert of alerts) {
      if (alert.severity === "critical" || alert.severity === "high") {
        result = result.replace(alert.pattern, "[REDACTED: suspicious content]");
      }
    }

    // Strip ANSI from web content (prevent terminal manipulation)
    if (source === "web" || source === "mcp") {
      result = result.replace(ANSI_REGEX, "");
    }

    // Remove control characters
    result = result.replace(CONTROL_CHARS, "");

    // Truncate extremely long lines (potential obfuscated payloads)
    result = result.split("\n").map((line) => {
      if (line.length > 10_000) {
        return line.slice(0, 10_000) + " [line truncated]";
      }
      return line;
    }).join("\n");

    // Redact credential-like strings
    result = redactCredentials(result);

    return result;
  }
}
