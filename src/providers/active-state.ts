/**
 * Active provider state — single source of truth for current provider + model.
 * All UI components (status bar, /settings, /model) read from here.
 * Config.json is synced on change for persistence.
 */
import { EventEmitter } from "node:events";

export interface ProviderState {
  provider: string;
  model: string;
  connectionStatus: "connected" | "disconnected" | "connecting";
  autoDetected: boolean;
  endpoint?: string;
}

class ActiveProviderStateImpl extends EventEmitter {
  private state: ProviderState = {
    provider: "",
    model: "",
    connectionStatus: "disconnected",
    autoDetected: false,
  };

  /** Set the active provider and model. Emits "changed" event. */
  setActive(provider: string, model: string, opts?: { autoDetected?: boolean; endpoint?: string }): void {
    this.state = {
      provider,
      model,
      connectionStatus: "connected",
      autoDetected: opts?.autoDetected ?? false,
      endpoint: opts?.endpoint,
    };
    this.emit("changed", this.state);
  }

  /** Update just the model (e.g., from /model command). */
  setModel(model: string): void {
    this.state.model = model;
    this.emit("changed", this.state);
  }

  /** Mark as disconnected. */
  setDisconnected(): void {
    this.state.connectionStatus = "disconnected";
    this.emit("changed", this.state);
  }

  get provider(): string { return this.state.provider; }
  get model(): string { return this.state.model; }
  get connectionStatus(): string { return this.state.connectionStatus; }
  get autoDetected(): boolean { return this.state.autoDetected; }
  get endpoint(): string | undefined { return this.state.endpoint; }

  getState(): ProviderState { return { ...this.state }; }

  /** Check if any provider is active. */
  isConfigured(): boolean {
    return this.state.provider !== "" && this.state.connectionStatus === "connected";
  }
}

/** Singleton instance. */
let _instance: ActiveProviderStateImpl | null = null;

export function getActiveProviderState(): ActiveProviderStateImpl {
  if (!_instance) _instance = new ActiveProviderStateImpl();
  return _instance;
}

export function resetActiveProviderState(): void {
  _instance = null;
}
