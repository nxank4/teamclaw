/**
 * Vector Knowledge Base - RAG via ChromaDB and Ollama embeddings.
 * Falls back to JSON file when Chroma server is unavailable.
 */

import { ChromaClient, OllamaEmbeddingFunction } from "chromadb";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.js";

const LESSONS_COLLECTION = "lessons";
const EMBEDDING_MODEL = "nomic-embed-text";

function log(msg: string): void {
  if (CONFIG.verboseLogging) {
    console.log(`[vector-memory] ${msg}`);
  }
}

export interface VectorMemoryStats {
  enabled: boolean;
  persistDirectory?: string;
  lessonsCount?: number;
  embeddingModel?: string;
  fallbackFile?: string;
}

export class VectorMemory {
  readonly persistDirectory: string;
  enabled = false;
  private client: ChromaClient | null = null;
  private lessonsCollection: Awaited<ReturnType<ChromaClient["getOrCreateCollection"]>> | null = null;
  private fallbackPath: string;

  constructor(persistDirectory = "data/vector_store") {
    this.persistDirectory = persistDirectory;
    this.fallbackPath = path.join(persistDirectory, "lessons_fallback.json");
  }

  async init(): Promise<void> {
    const chromaHost = process.env.CHROMADB_HOST ?? "localhost";
    const chromaPort =
      process.env.CHROMADB_PORT ?? (process.env.CHROMADB_HOST ? "8000" : "8020");
    const path = `http://${chromaHost}:${chromaPort}`;

    try {
      const embedder = new OllamaEmbeddingFunction({
        url: CONFIG.llmBaseUrl,
        model: EMBEDDING_MODEL,
      });

      this.client = new ChromaClient({ path });
      this.lessonsCollection = await this.client.getOrCreateCollection({
        name: LESSONS_COLLECTION,
        embeddingFunction: embedder,
        metadata: { description: "Lessons learned from team failures" },
      });

      this.enabled = true;
      log(`✅ Vector Memory initialized at ${path}`);
    } catch (err) {
      log(`⚠️ ChromaDB unavailable: ${err}. Using JSON fallback.`);
      this.enabled = false;
      await this._ensureFallbackDir();
    }
  }

  private async _ensureFallbackDir(): Promise<void> {
    try {
      await mkdir(this.persistDirectory, { recursive: true });
    } catch {
      // ignore
    }
  }

  async addLesson(text: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
    if (this.enabled && this.lessonsCollection) {
      try {
        const id = `lesson_${Date.now()}`;
        const meta = { ...metadata, type: "lesson", timestamp: Date.now() / 1000 };
        await this.lessonsCollection.add({
          ids: [id],
          documents: [text],
          metadatas: [meta as Record<string, string | number | boolean>],
        });
        log(`📚 Stored lesson: "${text.slice(0, 50)}..."`);
        return true;
      } catch (err) {
        log(`❌ Failed to store lesson: ${err}`);
        return await this._fallbackAddLesson(text);
      }
    }
    return await this._fallbackAddLesson(text);
  }

  private async _fallbackAddLesson(text: string): Promise<boolean> {
    try {
      await this._ensureFallbackDir();
      let lessons: string[] = [];
      try {
        const raw = await readFile(this.fallbackPath, "utf-8");
        lessons = JSON.parse(raw) as string[];
      } catch {
        // file missing or invalid
      }
      lessons.push(text);
      await writeFile(this.fallbackPath, JSON.stringify(lessons, null, 2));
      log(`📚 Stored lesson (fallback): "${text.slice(0, 50)}..."`);
      return true;
    } catch (err) {
      log(`❌ Fallback store failed: ${err}`);
      return false;
    }
  }

  async retrieveRelevantLessons(query: string, nResults = 5): Promise<string[]> {
    if (this.enabled && this.lessonsCollection) {
      try {
        const count = await this.lessonsCollection.count();
        if (count === 0) return [];
        const results = await this.lessonsCollection.query({
          queryTexts: [query],
          nResults: Math.min(nResults, count),
        });
        const docs = results.documents?.[0];
        return (docs?.filter(Boolean) ?? []) as string[];
      } catch (err) {
        log(`❌ Retrieval failed: ${err}`);
      }
    }
    return await this._fallbackGetLessons();
  }

  private async _fallbackGetLessons(): Promise<string[]> {
    try {
      const raw = await readFile(this.fallbackPath, "utf-8");
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  async getCumulativeLessons(): Promise<string[]> {
    const fromChroma = this.enabled && this.lessonsCollection
      ? await this._getAllLessonsFromChroma()
      : [];
    const fromFallback = await this._fallbackGetLessons();
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const l of [...fromFallback, ...fromChroma]) {
      if (l && !seen.has(l)) {
        seen.add(l);
        merged.push(l);
      }
    }
    return merged;
  }

  private async _getAllLessonsFromChroma(): Promise<string[]> {
    if (!this.lessonsCollection) return [];
    try {
      const result = await this.lessonsCollection.get();
      return (result.documents ?? []).filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  getStats(): VectorMemoryStats {
    if (!this.enabled) {
      return { enabled: false, fallbackFile: this.fallbackPath };
    }
    return {
      enabled: true,
      persistDirectory: this.persistDirectory,
      embeddingModel: EMBEDDING_MODEL,
      fallbackFile: this.fallbackPath,
    };
  }
}
