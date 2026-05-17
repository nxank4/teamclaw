/**
 * Slug helpers for auto-created spec / plan files.
 *
 * The first 5 words of a prompt are lowercased + non-alphanumerics
 * stripped to produce a kebab-case slug. If the resulting slug is
 * empty (e.g. the prompt was emoji or punctuation), fall back to
 * "untitled". Caller is responsible for resolving on-disk collisions
 * via {@link nextAvailableSlug}.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function deriveSlug(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "untitled";
}

/**
 * Given `base` and a directory, return the slug to use after collision
 * resolution: if `<base>.md` is free, returns `base`; otherwise tries
 * `<base>-2`, `<base>-3`, ... up to `<base>-99`. Throws when the
 * counter blows past 99 (a sign something is wrong upstream).
 */
export function nextAvailableSlug(baseSlug: string, dir: string): string {
  const absDir = resolve(dir);
  if (!existsSync(resolve(absDir, `${baseSlug}.md`))) return baseSlug;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!existsSync(resolve(absDir, `${candidate}.md`))) return candidate;
  }
  throw new Error(`Slug collision: ${baseSlug} and -2..-99 all taken in ${absDir}`);
}
