export interface ProxyStreamQuery {
  prompt: string;
  options?: string; // JSON-encoded StreamOptions
}

export interface ProxyChunkEvent {
  event: "chunk";
  data: { content: string; index: number };
}

export interface ProxyDoneEvent {
  event: "done";
  data: { totalChunks: number };
}

export interface ProxyErrorEvent {
  event: "error";
  data: { code: string; message: string };
}

export interface ProxyHealthResponse {
  connected: boolean;
  providerUrl: string;
  uptime: number;
}

export interface ProxyReconnectResponse {
  success: boolean;
  message: string;
}

export type ProxyLogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "trace" | "silent";

export interface ProxyPluginOptions {
  basePath?: string;        // default "/proxy"
  logLevel?: ProxyLogLevel; // default "info"
}
