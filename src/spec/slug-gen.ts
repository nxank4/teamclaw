/**
 * LLM-backed slug generation for new specs.
 *
 * Asks the user's configured model for a short kebab-case slug
 * describing the feature in 3-5 words. Falls back deterministically
 * to {@link deriveSlug} when:
 *   - the call throws (network / auth / provider error)
 *   - the response is empty
 *   - the extracted candidate fails the strict slug pattern
 *
 * The returned slug is bare (no ".md" extension); collision
 * resolution is the caller's job via {@link nextAvailableSlug}.
 */

import { callLLM } from "../engine/llm.js";
import { deriveSlug } from "./slug.js";

export interface SlugGenOptions {
  /**
   * Test seam — override the LLM call. Receives the full prompt and
   * returns the model's raw text. Defaults to a thin wrapper around
   * {@link callLLM}.
   */
  llmCall?: (prompt: string) => Promise<string>;
  /** Forwarded to callLLM. */
  signal?: AbortSignal;
}

/**
 * Pure extractor — pulls a slug candidate out of arbitrary LLM
 * response text. Exported so the prompt-handler / tests can verify
 * the parser without an LLM in the loop.
 *
 * Returns null when no candidate can be salvaged.
 */
export function extractSlugCandidate(raw: string): string | null {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (firstLine === "") return null;

  // Strip wrapping punctuation that LLMs frequently emit around the
  // slug (backticks, asterisks, quotes) and common "Slug:" prefixes.
  const unwrapped = firstLine.replace(/^[`*'"]+|[`*'"]+$/g, "");
  const dePrefixed = unwrapped.replace(/^slug\s*[:=]\s*/i, "").trim();

  // Lowercase, collapse internal whitespace to hyphens, drop anything
  // else, normalize hyphen runs and trim, cap length.
  const normalized = dePrefixed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  if (normalized.length < 3) return null;
  if (!/^[a-z]/.test(normalized)) return null;
  return normalized;
}

/**
 * Build the user-facing prompt sent to the LLM. Exported for tests.
 */
export function buildSlugPrompt(userPrompt: string): string {
  return [
    "Read this user prompt and give it a short kebab-case slug.",
    "",
    "Prompt:",
    userPrompt,
    "",
    "Rules:",
    "- 3-5 words separated by hyphens",
    "- lowercase ASCII letters, digits, hyphens only",
    "- 40 characters max",
    "- output only the slug, nothing else (no quotes, no prefix)",
  ].join("\n");
}

/**
 * Generate a slug for `prompt`, calling the configured LLM. Falls
 * back to {@link deriveSlug} on any error or unparseable response.
 */
export async function generateSlug(
  prompt: string,
  options: SlugGenOptions = {},
): Promise<string> {
  const fallback = (): string => deriveSlug(prompt);

  const callImpl = options.llmCall ?? (async (p: string): Promise<string> => {
    const response = await callLLM(p, {
      systemPrompt: "You generate concise kebab-case feature slugs.",
      source: "spec-slug",
      signal: options.signal,
    });
    return response.text;
  });

  let raw: string;
  try {
    raw = await callImpl(buildSlugPrompt(prompt));
  } catch {
    return fallback();
  }

  const extracted = extractSlugCandidate(raw);
  return extracted ?? fallback();
}
