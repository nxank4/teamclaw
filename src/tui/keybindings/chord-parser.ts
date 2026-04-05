/**
 * Key chord parser — parses binding strings like "ctrl+k ctrl+s", "shift+tab", "<leader>n".
 */

export interface ParsedChord {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/**
 * Parse a key binding string into one or more chord steps.
 * "ctrl+n" → [{ key: "n", ctrl: true, ... }]
 * "ctrl+k ctrl+s" → [{ key: "k", ctrl: true }, { key: "s", ctrl: true }]
 * "<leader>n" → [{ key: "<leader>n", ... }] (resolved at runtime)
 */
export function parseChord(binding: string): ParsedChord[] {
  const normalized = binding.trim().toLowerCase();

  // Key chord: "ctrl+k ctrl+s" (space-separated, each part has modifier+key)
  const parts = normalized.split(/\s+/);
  return parts.map(parseSingleChord);
}

function parseSingleChord(part: string): ParsedChord {
  // Handle <leader> prefix
  if (part.startsWith("<leader>")) {
    return { key: part, ctrl: false, shift: false, alt: false, meta: false };
  }

  const tokens = part.split("+");
  const chord: ParsedChord = { key: "", ctrl: false, shift: false, alt: false, meta: false };

  for (const token of tokens) {
    switch (token) {
      case "ctrl": chord.ctrl = true; break;
      case "shift": chord.shift = true; break;
      case "alt": case "option": chord.alt = true; break;
      case "meta": case "cmd": case "command": case "super": chord.meta = true; break;
      default: chord.key = token; break;
    }
  }

  // Uppercase letter implies shift
  if (chord.key.length === 1 && chord.key !== chord.key.toLowerCase() && !chord.shift) {
    chord.shift = true;
    chord.key = chord.key.toLowerCase();
  }

  return chord;
}

/** Check if a chord matches a key + modifiers. */
export function matchesChord(
  chord: ParsedChord,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
): boolean {
  return (
    chord.key === key.toLowerCase() &&
    chord.ctrl === !!modifiers.ctrl &&
    chord.shift === !!modifiers.shift &&
    chord.alt === !!modifiers.alt &&
    chord.meta === !!modifiers.meta
  );
}

/**
 * Normalize a binding string for consistent comparison.
 * "CTRL+N" → "ctrl+n", "Ctrl+Shift+P" → "ctrl+shift+p"
 */
export function normalizeBinding(binding: string): string {
  const parts = binding.trim().toLowerCase().split(/\s+/);
  return parts.map((part) => {
    const tokens = part.split("+");
    const mods: string[] = [];
    let key = "";
    for (const t of tokens) {
      if (t === "ctrl" || t === "alt" || t === "option" || t === "shift" || t === "meta" || t === "cmd" || t === "command") {
        const normalized = (t === "option") ? "alt" : (t === "cmd" || t === "command") ? "meta" : t;
        mods.push(normalized);
      } else {
        key = t;
      }
    }
    mods.sort(); // alphabetical: alt, ctrl, meta, shift
    return [...mods, key].join("+");
  }).join(" ");
}

/**
 * Parse alternative bindings: "ctrl+c,ctrl+d" → two separate binding sets.
 */
export function parseAlternatives(binding: string): string[] {
  return binding.split(",").map((b) => b.trim()).filter(Boolean);
}
