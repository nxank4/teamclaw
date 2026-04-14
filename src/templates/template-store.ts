/**
 * Combined template store — merges built-in seed templates with
 * user-installed templates from ~/.openpawl/templates/.
 */

import { readFileSync } from "node:fs";
import { LocalTemplateStore } from "./local-store.js";
import { getAllSeedTemplates, getSeedTemplate } from "./seeds/index.js";
import { validateTemplate } from "./validator.js";
import type { OpenPawlTemplate, InstalledTemplate } from "./types.js";

const store = new LocalTemplateStore();

export function loadBuiltInTemplates(): OpenPawlTemplate[] {
  return getAllSeedTemplates().map((t) => ({ ...t, builtIn: true }));
}

export async function loadInstalledTemplates(): Promise<InstalledTemplate[]> {
  return store.list();
}

export async function getTemplate(id: string): Promise<OpenPawlTemplate | null> {
  const seed = getSeedTemplate(id);
  if (seed) return { ...seed, builtIn: true };

  return store.get(id);
}

export async function listTemplates(): Promise<OpenPawlTemplate[]> {
  const builtIn = loadBuiltInTemplates();
  const installed = await store.list();

  // Installed versions override built-in with same id
  const byId = new Map<string, OpenPawlTemplate>();
  for (const t of builtIn) byId.set(t.id, t);
  for (const t of installed) byId.set(t.id, t);

  return [...byId.values()];
}

export async function installTemplate(templatePath: string): Promise<void> {
  const raw = readFileSync(templatePath, "utf-8");
  const data = JSON.parse(raw) as unknown;
  const result = validateTemplate(data);

  if (!result.valid) {
    throw new Error(`Invalid template: ${result.errors.join(", ")}`);
  }

  await store.install(result.data!);
}
