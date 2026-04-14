import type { StreamChunk, StreamOptions } from "./stream-types.js";

export interface StreamProvider {
  readonly name: string;
  stream(prompt: string, options?: StreamOptions): AsyncGenerator<StreamChunk, void, undefined>;
  healthCheck(): Promise<boolean>;
  isAvailable(): boolean;
  setAvailable(available: boolean): void;
}
