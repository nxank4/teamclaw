/**
 * Persistent prompt history across sessions.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const MAX_ENTRIES = 500;
const DEBOUNCE_MS = 1000;

export class PromptHistoryStore {
  private history: string[] = [];
  private filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(os.homedir(), ".openpawl", "prompt-history.json");
  }

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.history = JSON.parse(raw) as string[];
    } catch {
      this.history = [];
    }
  }

  async add(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed || trimmed.startsWith("/")) return; // Skip slash commands

    // Deduplicate consecutive
    if (this.history[0] === trimmed) return;

    this.history.unshift(trimmed);
    if (this.history.length > MAX_ENTRIES) this.history = this.history.slice(0, MAX_ENTRIES);

    this.scheduleSave();
  }

  getAll(): string[] {
    return [...this.history];
  }

  search(query: string): string[] {
    const lower = query.toLowerCase();
    return this.history.filter((h) => h.toLowerCase().includes(lower));
  }

  async clear(): Promise<void> {
    this.history = [];
    await this.save();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), DEBOUNCE_MS);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  private async save(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!existsSync(dir)) await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(this.filePath, JSON.stringify(this.history), { encoding: "utf-8", mode: 0o600 });
    } catch { /* skip */ }
  }
}
