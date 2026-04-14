/**
 * ChatGPT Plus/Pro subscription OAuth provider.
 * Uses OpenAI SDK with OAuth access tokens instead of API keys.
 */

import OpenAI from "openai";
import type { StreamChunk, StreamOptions } from "./stream-types.js";
import type { StreamProvider } from "./provider.js";
import { ProviderError } from "./types.js";
import { logger } from "../core/logger.js";
import { refreshChatGPTToken } from "./chatgpt-auth.js";

const DEFAULT_MODEL = "gpt-5.3-codex";
const REFRESH_BUFFER_MS = 2 * 60 * 1000;

export interface ChatGPTOAuthConfig {
  oauthToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  model?: string;
  onTokenRefresh?: (tokens: { oauthToken: string; refreshToken: string; tokenExpiry: number }) => void;
}

export class ChatGPTOAuthProvider implements StreamProvider {
  readonly name = "chatgpt";
  private client: OpenAI | null = null;
  private oauthToken: string | null;
  private refreshToken: string | null;
  private tokenExpiry: number;
  private readonly model: string;
  private available = true;
  private refreshing: Promise<void> | null = null;
  private onTokenRefresh: ChatGPTOAuthConfig["onTokenRefresh"];

  constructor(config: ChatGPTOAuthConfig) {
    this.oauthToken = config.oauthToken ?? null;
    this.refreshToken = config.refreshToken ?? null;
    this.tokenExpiry = config.tokenExpiry ?? 0;
    this.model = config.model ?? DEFAULT_MODEL;
    this.onTokenRefresh = config.onTokenRefresh;
  }

  private async ensureToken(): Promise<void> {
    if (this.tokenExpiry > 0 && Date.now() > this.tokenExpiry - REFRESH_BUFFER_MS && this.refreshToken) {
      if (!this.refreshing) {
        this.refreshing = this.doRefresh();
      }
      await this.refreshing;
    }
  }

  private async doRefresh(): Promise<void> {
    try {
      if (!this.refreshToken) return;
      logger.debug("[chatgpt] refreshing oauth token");
      const result = await refreshChatGPTToken(this.refreshToken);
      if (result.isErr()) {
        logger.warn(`[chatgpt] token refresh failed: ${result.error.message}`);
        return;
      }
      const { accessToken: oauthToken, refreshToken, expiresIn } = result.value;
      this.oauthToken = oauthToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = Date.now() + expiresIn * 1000;
      this.client = null;
      logger.debug("[chatgpt] token refreshed, expires at " + new Date(this.tokenExpiry).toISOString());
      this.onTokenRefresh?.({ oauthToken, refreshToken, tokenExpiry: this.tokenExpiry });
    } catch (e) {
      logger.warn(`[chatgpt] token refresh error: ${String(e)}`);
    } finally {
      this.refreshing = null;
    }
  }

  private getClient(): OpenAI {
    if (!this.oauthToken) {
      throw new ProviderError({
        provider: "chatgpt",
        code: "CHATGPT_OAUTH_REQUIRED",
        message: "No ChatGPT OAuth token. Run: openpawl providers add chatgpt",
        isFallbackTrigger: true,
      });
    }
    if (!this.client || this.client.apiKey !== this.oauthToken) {
      this.client = new OpenAI({ apiKey: this.oauthToken, baseURL: "https://api.openai.com/v1" });
    }
    return this.client;
  }

  async *stream(prompt: string, options?: StreamOptions): AsyncGenerator<StreamChunk, void, undefined> {
    await this.ensureToken();
    const client = this.getClient();
    const model = options?.model ?? this.model;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
    messages.push({ role: "user", content: prompt });

    logger.debug(`[chatgpt] streaming with model=${model}`);

    try {
      const stream = await client.chat.completions.create(
        { model, messages, temperature: options?.temperature, stream: true, stream_options: { include_usage: true } },
        { signal: options?.signal },
      );

      let usage: { promptTokens: number; completionTokens: number } | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) yield { content: delta.content, done: false };
        if (chunk.usage) {
          usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
        }
      }

      yield { content: "", done: true, usage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth = message.includes("401") || message.includes("invalid_api_key");
      const isRateLimit = message.includes("429") || message.includes("rate_limit");

      if (isAuth && this.refreshToken) {
        await this.doRefresh();
      }

      throw new ProviderError({
        provider: "chatgpt",
        code: isAuth ? "CHATGPT_TOKEN_EXPIRED" : isRateLimit ? "RATE_LIMITED" : "STREAM_FAILED",
        message: `ChatGPT API error: ${message}`,
        statusCode: isAuth ? 401 : isRateLimit ? 429 : undefined,
        isFallbackTrigger: isAuth || isRateLimit,
        cause: err,
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    await this.ensureToken();
    if (!this.oauthToken) return false;
    try {
      const client = this.getClient();
      await client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  isAvailable(): boolean { return this.oauthToken != null && this.available; }
  setAvailable(available: boolean): void { this.available = available; }
}
