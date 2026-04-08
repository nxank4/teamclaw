/**
 * Detect prompt injection patterns in external content.
 * Regex-based, fast (under 10ms per content block).
 */

import type { ContentSource, InjectionAlert } from "./types.js";

interface PatternDef {
  regex: RegExp;
  severity: InjectionAlert["severity"];
  recommendation: string;
  skipSources: ContentSource[];
}

const PATTERNS: PatternDef[] = [
  // Critical - instruction override attempts
  { regex: /ignore\s+(all\s+)?previous\s+instructions/gi, severity: "critical", recommendation: "Block content from context", skipSources: ["user"] },
  { regex: /you\s+are\s+now\s+a/gi, severity: "critical", recommendation: "Block content from context", skipSources: ["user"] },
  { regex: /system\s*:\s*(you|your|act|behave)/gi, severity: "critical", recommendation: "Block content from context", skipSources: ["user"] },
  { regex: /\[SYSTEM\]|\[INST\]|<\|system\|>/gi, severity: "critical", recommendation: "Template injection marker", skipSources: ["user"] },
  { regex: /forget\s+(everything|all|your\s+instructions)/gi, severity: "critical", recommendation: "Block content from context", skipSources: ["user"] },

  // High - manipulation attempts
  { regex: /do\s+not\s+follow\s+(the|your|previous)/gi, severity: "high", recommendation: "Sanitize before injection", skipSources: ["user"] },
  { regex: /override\s+(your|the|all)\s+(rules|instructions)/gi, severity: "high", recommendation: "Sanitize before injection", skipSources: ["user"] },
  { regex: /new\s+instructions?\s*:/gi, severity: "high", recommendation: "Sanitize before injection", skipSources: ["user"] },
  { regex: /curl\s+.*\|\s*sh/gi, severity: "high", recommendation: "Dangerous command pattern", skipSources: [] },

  // Medium - credential leaks and dangerous patterns
  { regex: /(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S{10,}/gi, severity: "medium", recommendation: "Potential credential leak", skipSources: ["user"] },
  { regex: /\bsudo\b.*\brm\b/gi, severity: "medium", recommendation: "Dangerous command embedded", skipSources: ["user"] },

  // Low - social engineering
  { regex: /\b(please|kindly)\s+(ignore|disregard|forget)/gi, severity: "low", recommendation: "Possible social engineering", skipSources: ["user"] },
  { regex: /\bpretend\s+(you|to\s+be)/gi, severity: "low", recommendation: "Role manipulation attempt", skipSources: ["user"] },
];

export class InjectionDetector {
  detect(content: string, source: ContentSource): InjectionAlert[] {
    if (source === "user") return [];

    const alerts: InjectionAlert[] = [];

    for (const pattern of PATTERNS) {
      if (pattern.skipSources.includes(source)) continue;

      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(content)) !== null) {
        const position = match.index;
        const start = Math.max(0, position - 25);
        const end = Math.min(content.length, position + match[0].length + 25);

        alerts.push({
          severity: pattern.severity,
          pattern: match[0],
          position,
          snippet: content.slice(start, end),
          recommendation: pattern.recommendation,
        });
      }
    }

    return alerts;
  }
}
