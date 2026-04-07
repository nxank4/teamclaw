# Setup Flow Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify OpenPawl's two disconnected setup wizards into one flow, consolidate duplicated provider detection, and wire the existing credential store for secure API key storage.

**Architecture:** Detection logic consolidates into `src/providers/` (where `provider-catalog.ts` already lives). The unified wizard lives in `src/onboard/setup-flow.ts`, replacing both `setup-wizard.ts` and `commands/setup/connection.ts`. Commands remain thin wrappers. Config schema gains `activeProvider`/`activeModel` fields and `hasCredential` flag.

**Tech Stack:** TypeScript, @clack/prompts, neverthrow, Zod (env schema), Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-setup-flow-refactor-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/providers/detect.ts` | Unified provider detection from env vars, Ollama, LM Studio, existing config |
| Create | `src/providers/validate.ts` | API key validation via lightweight health checks |
| Create | `src/onboard/setup-flow.ts` | Unified interactive setup wizard |
| Create | `src/commands/settings.ts` | `openpawl settings` get/set/reset subcommands |
| Create | `tests/providers/detect.test.ts` | Tests for provider detection |
| Create | `tests/providers/validate.test.ts` | Tests for API key validation |
| Create | `tests/onboard/setup-flow.test.ts` | Tests for unified wizard |
| Create | `tests/commands/settings.test.ts` | Tests for settings command |
| Modify | `src/core/global-config.ts` | Add `activeProvider`, `activeModel`, `hasCredential` migration |
| Modify | `src/providers/provider-factory.ts` | Use `CredentialStore.resolveApiKey()` instead of `entry.apiKey` |
| Modify | `src/commands/providers.ts` | Replace local ENV_KEYS with `detectProviders()` import |
| Modify | `src/onboard/env-detector.ts` | Remove provider detection, keep project detection |
| Modify | `src/onboard/first-run.ts` | Simplify to call `runSetup()` |
| Modify | `src/commands/setup.ts` | Gut to thin wrapper over `runSetup()` |
| Modify | `src/cli.ts` | Wire `settings` command, update first-run path |
| Delete | `src/onboard/setup-wizard.ts` | Replaced by `setup-flow.ts` |
| Delete | `src/onboard/legacy.ts` | Dead shim |
| Delete | `src/commands/setup/connection.ts` | Logic moved to `setup-flow.ts` |
| Delete | `src/commands/setup/composition-mode.ts` | Only used by `connection.ts` |

---

## Task 1: Create `src/providers/detect.ts` — Unified Provider Detection

**Files:**
- Create: `src/providers/detect.ts`
- Create: `tests/providers/detect.test.ts`
- Reference: `src/providers/provider-catalog.ts` (envKeys per provider)
- Reference: `src/onboard/env-detector.ts:98-114` (existing env scanning pattern)
- Reference: `src/onboard/types.ts` (DetectedEnvironment shape)

- [ ] **Step 1: Write failing tests for `detectProviders()`**

```typescript
// tests/providers/detect.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DetectedProvider } from "../../src/providers/detect.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("detectProviders", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    // Clear all provider env vars
    for (const key of Object.keys(process.env)) {
      if (key.includes("API_KEY") || key.includes("GITHUB_TOKEN") || key.includes("AWS_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detects ANTHROPIC_API_KEY from env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const anthropic = result.find((p) => p.type === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.available).toBe(true);
    expect(anthropic!.source).toBe("env");
    expect(anthropic!.envKey).toBe("ANTHROPIC_API_KEY");
  });

  it("detects Ollama when reachable", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: "llama3" }, { name: "codellama" }] }),
    });
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const ollama = result.find((p) => p.type === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(true);
    expect(ollama!.models).toEqual(["llama3", "codellama"]);
    expect(ollama!.source).toBe("ollama");
  });

  it("marks Ollama unavailable on timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const ollama = result.find((p) => p.type === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(false);
  });

  it("sorts available providers first", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    mockFetch.mockRejectedValue(new Error("no ollama"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const firstAvailable = result.findIndex((p) => p.available);
    const firstUnavailable = result.findIndex((p) => !p.available);
    if (firstAvailable >= 0 && firstUnavailable >= 0) {
      expect(firstAvailable).toBeLessThan(firstUnavailable);
    }
  });

  it("returns empty models for env-detected providers", async () => {
    process.env.DEEPSEEK_API_KEY = "sk-deep-test";
    mockFetch.mockRejectedValue(new Error("no local"));
    const { detectProviders } = await import("../../src/providers/detect.js");
    const result = await detectProviders();
    const deepseek = result.find((p) => p.type === "deepseek");
    expect(deepseek).toBeDefined();
    expect(deepseek!.models).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/providers/detect.test.ts`
Expected: FAIL — module `../../src/providers/detect.js` not found

- [ ] **Step 3: Implement `src/providers/detect.ts`**

```typescript
// src/providers/detect.ts
import { PROVIDER_CATALOG } from "./provider-catalog.js";

export interface DetectedProvider {
  type: string;
  available: boolean;
  models?: string[];
  source: "env" | "ollama" | "lmstudio" | "config";
  envKey?: string;
}

const PROBE_TIMEOUT_MS = 3_000;

async function probeLocal(
  url: string,
  modelsPath: string,
  source: "ollama" | "lmstudio",
): Promise<DetectedProvider | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${url}${modelsPath}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const models = extractModelNames(json, source);
    return { type: source, available: true, models, source };
  } catch {
    return null;
  }
}

function extractModelNames(json: Record<string, unknown>, source: string): string[] {
  if (source === "ollama" && Array.isArray(json.models)) {
    return (json.models as Array<{ name: string }>).map((m) => m.name);
  }
  if (Array.isArray(json.data)) {
    return (json.data as Array<{ id: string }>).map((m) => m.id);
  }
  return [];
}

function detectEnvProviders(): DetectedProvider[] {
  const found: DetectedProvider[] = [];
  const seen = new Set<string>();

  for (const [providerId, meta] of Object.entries(PROVIDER_CATALOG)) {
    for (const envKey of meta.envKeys) {
      if (process.env[envKey] && !seen.has(providerId)) {
        seen.add(providerId);
        found.push({ type: providerId, available: true, source: "env", envKey });
      }
    }
  }
  return found;
}

export async function detectProviders(): Promise<DetectedProvider[]> {
  const [ollamaResult, lmStudioResult] = await Promise.allSettled([
    probeLocal("http://localhost:11434", "/api/tags", "ollama"),
    probeLocal("http://localhost:1234", "/v1/models", "lmstudio"),
  ]);

  const detected: DetectedProvider[] = [];

  // Local providers
  const ollama = ollamaResult.status === "fulfilled" ? ollamaResult.value : null;
  detected.push(ollama ?? { type: "ollama", available: false, source: "ollama" });

  const lmStudio = lmStudioResult.status === "fulfilled" ? lmStudioResult.value : null;
  if (lmStudio) detected.push(lmStudio);

  // Env var providers
  detected.push(...detectEnvProviders());

  // Sort: available first
  detected.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));

  return detected;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/providers/detect.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/detect.ts tests/providers/detect.test.ts
git commit -m "feat: add unified provider detection in src/providers/detect.ts"
```

---

## Task 2: Create `src/providers/validate.ts` — API Key Validation

**Files:**
- Create: `src/providers/validate.ts`
- Create: `tests/providers/validate.test.ts`
- Reference: `src/onboard/setup-wizard.ts:355-366` (existing validateApiKey)
- Reference: `src/commands/setup/connection.ts:465-480` (testProviderConnection)
- Reference: `src/providers/provider-catalog.ts` (baseURL per provider)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/providers/validate.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("validateApiKey", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns ok with latency for valid Anthropic key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("anthropic", "sk-ant-test", "https://api.anthropic.com");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns err for rejected key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("openai", "sk-bad", "https://api.openai.com/v1");
    expect(result.isErr()).toBe(true);
  });

  it("returns err on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("anthropic", "sk-ant-test", "https://api.anthropic.com");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.value.message).toContain("ECONNREFUSED");
    }
  });

  it("validates Ollama without API key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const { validateApiKey } = await import("../../src/providers/validate.js");
    const result = await validateApiKey("ollama", "", "http://localhost:11434");
    expect(result.isOk()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/providers/validate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/providers/validate.ts`**

```typescript
// src/providers/validate.ts
import { ok, err, type Result } from "neverthrow";

export interface ValidationSuccess {
  latencyMs: number;
}

export interface ValidationError {
  message: string;
}

const VALIDATE_TIMEOUT_MS = 5_000;

function getHealthEndpoint(providerType: string, baseUrl: string): { url: string; headers: Record<string, string> } {
  // Ollama and local providers use /api/tags
  if (providerType === "ollama") {
    return { url: `${baseUrl}/api/tags`, headers: {} };
  }
  // Anthropic uses its own endpoint format
  if (providerType === "anthropic") {
    return { url: `${baseUrl}/v1/models`, headers: {} };
  }
  // OpenAI-compatible providers use /v1/models
  return { url: `${baseUrl.replace(/\/+$/, "")}/models`, headers: {} };
}

export async function validateApiKey(
  providerType: string,
  apiKey: string,
  baseUrl: string,
): Promise<Result<ValidationSuccess, ValidationError>> {
  const { url, headers } = getHealthEndpoint(providerType, baseUrl);

  if (apiKey) {
    if (providerType === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return err({ message: `Provider returned ${res.status} — check your API key` });
    }
    return ok({ latencyMs });
  } catch (e) {
    return err({ message: (e as Error).message });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/providers/validate.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/validate.ts tests/providers/validate.test.ts
git commit -m "feat: add API key validation in src/providers/validate.ts"
```

---

## Task 3: Extend `src/core/global-config.ts` — Schema + Migration

**Files:**
- Modify: `src/core/global-config.ts`
- Create: `tests/core/global-config-migration.test.ts`
- Reference: `src/credentials/credential-store.ts` (setCredential API)

- [ ] **Step 1: Write failing tests for migration**

```typescript
// tests/core/global-config-migration.test.ts
import { describe, it, expect, vi } from "vitest";
import { normalizeGlobalConfig } from "../../src/core/global-config.js";

describe("global config schema extensions", () => {
  it("preserves activeProvider and activeModel fields", () => {
    const config = normalizeGlobalConfig({
      version: 1,
      activeProvider: "anthropic",
      activeModel: "claude-sonnet-4-6",
      providers: [],
    });
    expect(config.activeProvider).toBe("anthropic");
    expect(config.activeModel).toBe("claude-sonnet-4-6");
  });

  it("defaults activeProvider to first provider type", () => {
    const config = normalizeGlobalConfig({
      version: 1,
      providers: [{ type: "openai", apiKey: "sk-test" }],
    });
    expect(config.activeProvider).toBe("openai");
  });

  it("defaults activeModel to model field", () => {
    const config = normalizeGlobalConfig({
      version: 1,
      model: "gpt-4o",
      providers: [],
    });
    expect(config.activeModel).toBe("gpt-4o");
  });

  it("preserves hasCredential flag on provider entries", () => {
    const config = normalizeGlobalConfig({
      version: 1,
      providers: [{ type: "anthropic", hasCredential: true }],
    });
    expect(config.providers[0].hasCredential).toBe(true);
    expect(config.providers[0].apiKey).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/core/global-config-migration.test.ts`
Expected: FAIL — `activeProvider` not preserved (normalizeGlobalConfig strips unknown fields)

- [ ] **Step 3: Add `activeProvider`, `activeModel` to `OpenPawlGlobalConfig` and `hasCredential` to `ProviderConfigEntry`**

In `src/core/global-config.ts`, add to the `ProviderConfigEntry` interface (after `apiVersion?: string;` at ~line 28):

```typescript
  hasCredential?: boolean;
```

Add to `OpenPawlGlobalConfig` interface (after `version: 1;` at ~line 31):

```typescript
  activeProvider?: string;
  activeModel?: string;
```

In `normalizeGlobalConfig()`, add handling after providers are parsed (~line 400 area, after the providers normalization block):

```typescript
  // Active provider / model
  const activeProvider =
    typeof raw.activeProvider === "string" && raw.activeProvider
      ? raw.activeProvider
      : providers.length > 0
        ? providers[0].type
        : undefined;

  const activeModel =
    typeof raw.activeModel === "string" && raw.activeModel
      ? raw.activeModel
      : typeof raw.model === "string" && raw.model
        ? raw.model
        : undefined;
```

Include `activeProvider` and `activeModel` in the returned config object.

For `hasCredential`, preserve it in the provider entry normalization loop:

```typescript
  hasCredential: Boolean(p.hasCredential),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/core/global-config-migration.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Run full test suite to check nothing breaks**

Run: `bun run test`
Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/global-config.ts tests/core/global-config-migration.test.ts
git commit -m "feat: add activeProvider, activeModel, hasCredential to global config schema"
```

---

## Task 4: Wire `CredentialStore` into `provider-factory.ts`

**Files:**
- Modify: `src/providers/provider-factory.ts`
- Reference: `src/credentials/credential-store.ts:81-95` (resolveApiKey)

- [ ] **Step 1: Update `providerFromConfig()` to resolve keys from CredentialStore**

In `src/providers/provider-factory.ts`, at the top of `providerFromConfig()` (~line 49), add credential resolution for entries that have `hasCredential: true` but no `apiKey`:

```typescript
import { CredentialStore } from "../credentials/credential-store.js";

// Inside providerFromConfig(), before the switch statement:
  let resolvedApiKey = entry.apiKey;
  if (!resolvedApiKey && entry.hasCredential) {
    const store = new CredentialStore();
    await store.initialize();
    resolvedApiKey = await store.resolveApiKey(entry.type) ?? undefined;
  }
```

Note: `providerFromConfig` is currently synchronous. It needs to become `async` — update the signature:

```typescript
export async function providerFromConfig(entry: ProviderConfigEntry): Promise<StreamProvider | null>
```

Update all callers (search for `providerFromConfig(` — these are in `provider-factory.ts` itself and `provider-manager.ts`). Each call site needs `await`.

- [ ] **Step 2: Replace `discoverFromEnv()` with import from `detect.ts`**

Remove the local `ENV_KEY_MAP` (lines 24-47) and `discoverFromEnv()` function (lines 108-129). Replace with:

```typescript
import { detectProviders } from "./detect.js";

export async function discoverFromEnv(): Promise<StreamProvider[]> {
  const detected = await detectProviders();
  const providers: StreamProvider[] = [];
  for (const d of detected.filter((p) => p.available && p.source === "env")) {
    const entry: ProviderConfigEntry = { type: d.type as ProviderName };
    const provider = await providerFromConfig(entry);
    if (provider) providers.push(provider);
  }
  return providers;
}
```

The key is no longer passed in the entry — `providerFromConfig` resolves it from env vars via `CredentialStore.resolveApiKey()` which checks `process.env` first.

- [ ] **Step 3: Run existing tests**

Run: `bun run test`
Expected: all tests PASS (providerFromConfig is tested indirectly through integration tests; the actual behavior hasn't changed since resolveApiKey falls back to env vars)

- [ ] **Step 4: Commit**

```bash
git add src/providers/provider-factory.ts
git commit -m "feat: wire CredentialStore into provider-factory for secure key resolution"
```

---

## Task 5: Create `src/onboard/setup-flow.ts` — Unified Setup Wizard

**Files:**
- Create: `src/onboard/setup-flow.ts`
- Create: `tests/onboard/setup-flow.test.ts`
- Reference: `src/onboard/setup-wizard.ts` (flow to replace)
- Reference: `src/commands/setup/connection.ts` (provider step logic to extract)
- Reference: `src/providers/detect.ts` (Task 1)
- Reference: `src/providers/validate.ts` (Task 2)
- Reference: `src/providers/model-fetcher.ts` (fetchModelsForProvider)
- Reference: `src/providers/model-cache.ts` (getCachedModels, setCachedModels)
- Reference: `src/credentials/credential-store.ts` (setCredential)
- Reference: `src/credentials/masking.ts` (maskCredential)
- Reference: `src/core/global-config.ts` (writeGlobalConfig, readGlobalConfigWithDefaults)
- Reference: `src/providers/provider-catalog.ts` (PROVIDER_CATALOG, getProviderMeta)
- Reference: `src/utils/searchable-select.ts` (searchableSelect)

- [ ] **Step 1: Write failing test for `runSetup()`**

```typescript
// tests/onboard/setup-flow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock clack prompts
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: "" })),
  select: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), step: vi.fn() },
}));

// Mock detect + validate
vi.mock("../../src/providers/detect.js", () => ({
  detectProviders: vi.fn(),
}));
vi.mock("../../src/providers/validate.js", () => ({
  validateApiKey: vi.fn(),
}));
vi.mock("../../src/providers/model-fetcher.js", () => ({
  fetchModelsForProvider: vi.fn(),
}));
vi.mock("../../src/providers/model-cache.js", () => ({
  getCachedModels: vi.fn(() => Promise.resolve(null)),
  setCachedModels: vi.fn(),
}));
vi.mock("../../src/credentials/credential-store.js", () => ({
  CredentialStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue({ isOk: () => true }),
    setCredential: vi.fn().mockResolvedValue({ isOk: () => true }),
  })),
}));
vi.mock("../../src/core/global-config.js", () => ({
  writeGlobalConfig: vi.fn(() => "/home/user/.openpawl/config.json"),
  readGlobalConfig: vi.fn(() => null),
  readGlobalConfigWithDefaults: vi.fn(() => ({ providers: [] })),
}));
// Mock searchableSelect
vi.mock("../../src/utils/searchable-select.js", () => ({
  searchableSelect: vi.fn(),
}));

import { select, password } from "@clack/prompts";
import { detectProviders } from "../../src/providers/detect.js";
import { validateApiKey } from "../../src/providers/validate.js";
import { fetchModelsForProvider } from "../../src/providers/model-fetcher.js";
import { writeGlobalConfig } from "../../src/core/global-config.js";
import { ok } from "neverthrow";

describe("runSetup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes first-run flow: detect → select provider → key → model → save", async () => {
    // Arrange
    vi.mocked(detectProviders).mockResolvedValue([
      { type: "anthropic", available: true, source: "env", envKey: "ANTHROPIC_API_KEY" },
      { type: "ollama", available: false, source: "ollama" },
    ]);
    vi.mocked(select)
      .mockResolvedValueOnce("anthropic")   // provider select
      .mockResolvedValueOnce("claude-sonnet-4-6"); // model select
    vi.mocked(password).mockResolvedValue("sk-ant-api03-test-key");
    vi.mocked(validateApiKey).mockResolvedValue(ok({ latencyMs: 280 }));
    vi.mocked(fetchModelsForProvider).mockResolvedValue({
      models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
      source: "api",
    });

    // Act
    const { runSetup } = await import("../../src/onboard/setup-flow.js");
    await runSetup();

    // Assert
    expect(detectProviders).toHaveBeenCalled();
    expect(validateApiKey).toHaveBeenCalledWith("anthropic", "sk-ant-api03-test-key", expect.any(String));
    expect(fetchModelsForProvider).toHaveBeenCalledWith("anthropic", "sk-ant-api03-test-key", expect.any(String));
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        activeProvider: "anthropic",
        activeModel: "claude-sonnet-4-6",
      }),
    );
  });

  it("pre-fills values during re-setup", async () => {
    vi.mocked(detectProviders).mockResolvedValue([
      { type: "anthropic", available: true, source: "env", envKey: "ANTHROPIC_API_KEY" },
    ]);
    // User presses Enter on all prompts (keeps current values)
    vi.mocked(select)
      .mockResolvedValueOnce("anthropic")
      .mockResolvedValueOnce("claude-sonnet-4-6");
    vi.mocked(password).mockResolvedValue("sk-ant-existing-key");
    vi.mocked(validateApiKey).mockResolvedValue(ok({ latencyMs: 200 }));
    vi.mocked(fetchModelsForProvider).mockResolvedValue({
      models: ["claude-sonnet-4-6"],
      source: "api",
    });

    const { runSetup } = await import("../../src/onboard/setup-flow.js");
    await runSetup({
      prefill: {
        version: 1,
        activeProvider: "anthropic",
        activeModel: "claude-sonnet-4-6",
        providers: [{ type: "anthropic", hasCredential: true }],
      } as any,
    });

    expect(writeGlobalConfig).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/onboard/setup-flow.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/onboard/setup-flow.ts`**

```typescript
// src/onboard/setup-flow.ts
import * as p from "@clack/prompts";
import pc from "picocolors";
import { detectProviders, type DetectedProvider } from "../providers/detect.js";
import { validateApiKey } from "../providers/validate.js";
import { fetchModelsForProvider } from "../providers/model-fetcher.js";
import { getCachedModels, setCachedModels } from "../providers/model-cache.js";
import { PROVIDER_CATALOG, getProviderMeta } from "../providers/provider-catalog.js";
import { maskCredential } from "../credentials/masking.js";
import { CredentialStore } from "../credentials/credential-store.js";
import {
  writeGlobalConfig,
  readGlobalConfig,
  type OpenPawlGlobalConfig,
  type ProviderConfigEntry,
} from "../core/global-config.js";

export interface SetupOptions {
  prefill?: OpenPawlGlobalConfig;
}

function handleCancel<T>(value: T): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

function formatDetection(detected: DetectedProvider[]): void {
  p.log.step(pc.bold("Detecting providers..."));
  for (const d of detected) {
    if (d.available) {
      const detail = d.source === "env" ? `${d.envKey} found` : d.models ? `${d.models.length} models` : "detected";
      p.log.success(`${d.type} (${detail})`);
    } else {
      p.log.info(pc.dim(`${d.type} — not found`));
    }
  }
}

function buildProviderOptions(
  detected: DetectedProvider[],
  currentProvider?: string,
): Array<{ value: string; label: string; hint?: string }> {
  const options: Array<{ value: string; label: string; hint?: string }> = [];
  const added = new Set<string>();

  // Detected providers first
  for (const d of detected.filter((p) => p.available)) {
    const meta = getProviderMeta(d.type);
    if (!meta || added.has(d.type)) continue;
    added.add(d.type);
    const hint = d.type === currentProvider ? "current" : "detected";
    options.push({ value: d.type, label: meta.menuLabel || meta.name, hint });
  }

  // All other providers from catalog
  for (const [id, meta] of Object.entries(PROVIDER_CATALOG)) {
    if (added.has(id) || meta.group) continue; // skip group variants
    added.add(id);
    const hint = id === currentProvider ? "current" : undefined;
    options.push({ value: id, label: meta.menuLabel || meta.name, hint });
  }

  return options;
}

async function resolveModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<string[]> {
  // Try cache first
  const cached = await getCachedModels(providerId);
  if (cached && cached.length > 0) return cached;

  // Live fetch
  try {
    const result = await fetchModelsForProvider(providerId, apiKey, baseUrl);
    if (result.models.length > 0) {
      await setCachedModels(providerId, result.models);
      return result.models;
    }
  } catch {
    // fall through to catalog
  }

  // Fallback to catalog
  const meta = getProviderMeta(providerId);
  return meta?.models.map((m) => (typeof m === "string" ? m : m.id)) ?? [];
}

function getBaseUrl(providerId: string): string {
  const meta = getProviderMeta(providerId);
  return meta?.baseURL ?? "https://api.openai.com/v1";
}

export async function runSetup(options?: SetupOptions): Promise<void> {
  const prefill = options?.prefill;
  const isResetup = Boolean(prefill);

  p.intro(pc.bold(pc.cyan(isResetup ? "OpenPawl — Reconfigure" : "Welcome to OpenPawl — your AI team, one prompt away.")));

  // Step 1: Detect providers
  const detected = await detectProviders();
  formatDetection(detected);

  // Step 2: Select provider
  const providerOptions = buildProviderOptions(detected, prefill?.activeProvider);
  const initialValue = prefill?.activeProvider ?? providerOptions.find((o) => o.hint === "detected")?.value;

  const selectedProvider = handleCancel(
    await p.select({
      message: "Select a provider",
      options: providerOptions,
      initialValue,
    }),
  ) as string;

  // Step 3: API key (skip for local providers)
  const meta = getProviderMeta(selectedProvider);
  const needsKey = meta?.authMethod !== "local";
  let apiKey = "";
  let baseUrl = getBaseUrl(selectedProvider);

  if (selectedProvider === "ollama") {
    baseUrl = "http://localhost:11434";
  }

  if (needsKey) {
    // Check if env var already has the key
    const envDetected = detected.find((d) => d.type === selectedProvider && d.source === "env");
    if (envDetected?.envKey && process.env[envDetected.envKey]) {
      const envVal = process.env[envDetected.envKey]!;
      p.log.info(`Using ${envDetected.envKey} from environment (${maskCredential(envVal)})`);
      apiKey = envVal;
    } else {
      apiKey = handleCancel(
        await p.password({
          message: `API key for ${meta?.name ?? selectedProvider}`,
          validate: (v) => (v.length < 5 ? "Key too short" : undefined),
        }),
      ) as string;
    }

    // Validate key
    const spin = p.spinner();
    spin.start("Verifying API key...");
    const validResult = await validateApiKey(selectedProvider, apiKey, baseUrl);
    if (validResult.isErr()) {
      spin.stop(pc.red(`Validation failed: ${validResult.error.message}`));
      // Re-prompt once
      apiKey = handleCancel(
        await p.password({
          message: `Try again — API key for ${meta?.name ?? selectedProvider}`,
        }),
      ) as string;
      const retry = await validateApiKey(selectedProvider, apiKey, baseUrl);
      if (retry.isErr()) {
        p.cancel(`Could not validate key: ${retry.error.message}`);
        process.exit(1);
      }
      spin.stop(pc.green(`Connected (${retry.value.latencyMs}ms)`));
    } else {
      spin.stop(pc.green(`Connected (${validResult.value.latencyMs}ms)`));
    }

    // Store key securely
    const store = new CredentialStore();
    const initResult = await store.initialize();
    if (initResult.isOk()) {
      await store.setCredential(selectedProvider, "apiKey", apiKey);
    }
  }

  // Step 4: Select model
  const spin2 = p.spinner();
  spin2.start("Fetching available models...");
  const models = await resolveModels(selectedProvider, apiKey, baseUrl);
  spin2.stop(`${models.length} models available`);

  if (models.length === 0) {
    p.cancel("No models found for this provider. Check your provider setup.");
    process.exit(1);
  }

  const modelOptions = models.map((m) => ({
    value: m,
    label: m,
    hint: m === prefill?.activeModel ? "current" : undefined,
  }));

  const selectedModel = handleCancel(
    await p.select({
      message: "Select a model",
      options: modelOptions,
      initialValue: prefill?.activeModel ?? models[0],
    }),
  ) as string;

  // Step 5: Verify connection (health check with latency)
  const spin3 = p.spinner();
  spin3.start("Verifying connection...");
  const healthResult = await validateApiKey(selectedProvider, apiKey, baseUrl);
  const latency = healthResult.isOk() ? `${healthResult.value.latencyMs}ms` : "ok";
  spin3.stop(pc.green(`Connected to ${meta?.name ?? selectedProvider} (${latency})`));

  // Step 6: Build and write config
  const existingConfig = readGlobalConfig();
  const providerEntry: ProviderConfigEntry = {
    type: selectedProvider as ProviderConfigEntry["type"],
    hasCredential: needsKey,
    model: selectedModel,
    baseURL: baseUrl !== getBaseUrl(selectedProvider) ? baseUrl : undefined,
  };

  // Merge: replace provider of same type, keep others
  const existingProviders = existingConfig?.providers?.filter((p) => p.type !== selectedProvider) ?? [];

  const newConfig: OpenPawlGlobalConfig = {
    ...(existingConfig ?? { version: 1 }),
    activeProvider: selectedProvider,
    activeModel: selectedModel,
    model: selectedModel,
    providers: [providerEntry, ...existingProviders],
  };

  const configPath = writeGlobalConfig(newConfig);

  // Step 7: Summary
  p.note(
    [
      `Provider:  ${meta?.name ?? selectedProvider}`,
      `Model:     ${selectedModel}`,
      `Config:    ${configPath}`,
    ].join("\n"),
    "Configuration saved",
  );

  p.outro(isResetup ? "Configuration updated!" : "You're all set! Run openpawl to start.");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/onboard/setup-flow.test.ts`
Expected: both tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/onboard/setup-flow.ts tests/onboard/setup-flow.test.ts
git commit -m "feat: unified setup wizard in src/onboard/setup-flow.ts"
```

---

## Task 6: Create `src/commands/settings.ts` — Settings Subcommands

**Files:**
- Create: `src/commands/settings.ts`
- Create: `tests/commands/settings.test.ts`
- Reference: `src/core/global-config.ts` (readGlobalConfigWithDefaults, writeGlobalConfig)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/settings.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/core/global-config.js", () => ({
  readGlobalConfigWithDefaults: vi.fn(() => ({
    version: 1,
    dashboardPort: 9001,
    debugMode: false,
    timeouts: { llm: 30000, health: 5000 },
  })),
  writeGlobalConfig: vi.fn(() => "/home/user/.openpawl/config.json"),
  readGlobalConfig: vi.fn(),
}));

describe("settings helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSettingValue reads dot-notation keys", async () => {
    const { getSettingValue } = await import("../../src/commands/settings.js");
    expect(getSettingValue("dashboardPort")).toBe(9001);
    expect(getSettingValue("timeouts.llm")).toBe(30000);
  });

  it("getSettingValue returns undefined for invalid keys", async () => {
    const { getSettingValue } = await import("../../src/commands/settings.js");
    expect(getSettingValue("nonexistent.key")).toBeUndefined();
  });

  it("setSettingValue writes dot-notation keys", async () => {
    const { writeGlobalConfig } = await import("../../src/core/global-config.js");
    const { setSettingValue } = await import("../../src/commands/settings.js");
    setSettingValue("dashboardPort", "8080");
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ dashboardPort: 8080 }),
    );
  });

  it("setSettingValue coerces booleans", async () => {
    const { writeGlobalConfig } = await import("../../src/core/global-config.js");
    const { setSettingValue } = await import("../../src/commands/settings.js");
    setSettingValue("debugMode", "true");
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({ debugMode: true }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- tests/commands/settings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/commands/settings.ts`**

```typescript
// src/commands/settings.ts
import pc from "picocolors";
import {
  readGlobalConfigWithDefaults,
  writeGlobalConfig,
  type OpenPawlGlobalConfig,
} from "../core/global-config.js";

const ALLOWED_KEYS = new Set([
  "dashboardPort",
  "debugMode",
  "tokenOptimization",
  "timeouts",
  "timeouts.llm",
  "timeouts.health",
  "dashboard",
  "dashboard.autoOpen",
  "work",
  "work.maxCycles",
  "work.mode",
  "streaming",
  "streaming.enabled",
  "personality",
  "personality.enabled",
  "handoff",
  "handoff.enabled",
]);

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]] || typeof target[keys[i]] !== "object") {
      target[keys[i]] = {};
    }
    target = target[keys[i]] as Record<string, unknown>;
  }
  target[keys[keys.length - 1]] = value;
}

function coerce(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  return value;
}

export function getSettingValue(key: string): unknown {
  const config = readGlobalConfigWithDefaults();
  return getNestedValue(config as unknown as Record<string, unknown>, key);
}

export function setSettingValue(key: string, value: string): void {
  const config = readGlobalConfigWithDefaults();
  const obj = config as unknown as Record<string, unknown>;
  setNestedValue(obj, key, coerce(value));
  writeGlobalConfig(obj as unknown as OpenPawlGlobalConfig);
}

export async function runSettings(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === "get" && args[1]) {
    const val = getSettingValue(args[1]);
    if (val === undefined) {
      console.log(pc.yellow(`Unknown key: ${args[1]}`));
      const suggestions = [...ALLOWED_KEYS].filter((k) => k.includes(args[1]));
      if (suggestions.length > 0) console.log(pc.dim(`Did you mean: ${suggestions.join(", ")}?`));
    } else {
      console.log(typeof val === "object" ? JSON.stringify(val, null, 2) : String(val));
    }
    return;
  }

  if (sub === "set" && args[1] && args[2]) {
    if (!ALLOWED_KEYS.has(args[1])) {
      console.log(pc.yellow(`Unknown key: ${args[1]}`));
      return;
    }
    setSettingValue(args[1], args[2]);
    console.log(pc.green(`${args[1]} = ${args[2]}`));
    return;
  }

  if (sub === "reset") {
    const { confirm } = await import("@clack/prompts");
    const yes = await confirm({ message: "Reset all settings to defaults?" });
    if (yes === true) {
      writeGlobalConfig({ version: 1 } as OpenPawlGlobalConfig);
      console.log(pc.green("Settings reset to defaults."));
    }
    return;
  }

  // Default: show all settings
  const config = readGlobalConfigWithDefaults();
  const display: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (!key.includes(".")) {
      display[key] = getNestedValue(config as unknown as Record<string, unknown>, key);
    }
  }
  console.log(pc.bold("\nOpenPawl Settings\n"));
  for (const [key, val] of Object.entries(display)) {
    const formatted = typeof val === "object" ? JSON.stringify(val) : String(val);
    console.log(`  ${pc.cyan(key.padEnd(22))} ${formatted}`);
  }
  console.log();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- tests/commands/settings.test.ts`
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/settings.ts tests/commands/settings.test.ts
git commit -m "feat: add openpawl settings command with get/set/reset"
```

---

## Task 7: Wire CLI Entry Point + Delete Old Files

**Files:**
- Modify: `src/cli.ts` (~lines 136-162 first-run block, add settings command)
- Modify: `src/onboard/first-run.ts` (simplify)
- Modify: `src/onboard/env-detector.ts` (remove provider detection)
- Modify: `src/commands/setup.ts` (gut to thin wrapper)
- Modify: `src/commands/providers.ts` (use detect.ts)
- Delete: `src/onboard/setup-wizard.ts`
- Delete: `src/onboard/legacy.ts`
- Delete: `src/commands/setup/connection.ts`
- Delete: `src/commands/setup/composition-mode.ts`

- [ ] **Step 1: Update `src/cli.ts` first-run block**

Replace the first-run detection block (~lines 136-162) to use `runSetup` directly:

```typescript
  if (!existsSync(configPath)) {
    const { runSetup } = await import("./onboard/setup-flow.js");
    await runSetup();
  }
```

Add `settings` command to the dispatch chain (find the `else if` chain, add near the other config commands):

```typescript
  } else if (cmd === "settings") {
    const { runSettings } = await import("./commands/settings.js");
    await runSettings(args.slice(1));
```

Update the `setup` / `init` command handler to use the new flow:

```typescript
  } else if (cmd === "setup" || cmd === "init") {
    const { readGlobalConfig } = await import("./core/global-config.js");
    const { runSetup } = await import("./onboard/setup-flow.js");
    const existing = readGlobalConfig();
    await runSetup({ prefill: existing ?? undefined });

    // Full wizard steps (workspace, project, goal, team) behind --full flag
    if (args.includes("--full")) {
      const { runFullSetupSteps } = await import("./commands/setup.js");
      await runFullSetupSteps();
    }
```

- [ ] **Step 2: Simplify `src/onboard/first-run.ts`**

Replace the entire file content with:

```typescript
// src/onboard/first-run.ts
import { ok, err, type Result } from "neverthrow";
import { runSetup } from "./setup-flow.js";
import type { FirstRunResult, OnboardError } from "./types.js";

export async function handleFirstRun(): Promise<Result<FirstRunResult, OnboardError>> {
  if (!process.stdout.isTTY) {
    return err({ type: "not_interactive", message: "OpenPawl setup requires an interactive terminal. Run: openpawl setup" });
  }

  try {
    await runSetup();
    return ok({
      configPath: "~/.openpawl/config.json",
      isNewSetup: true,
      isExistingConfig: false,
      environment: {} as any,
      suggestions: [],
    });
  } catch {
    return err({ type: "cancelled", message: "Setup cancelled" });
  }
}
```

- [ ] **Step 3: Slim `src/onboard/env-detector.ts` — remove provider env scanning**

Remove the `ENV_KEY_PROVIDERS` map (~lines 14-29) and `detectEnvKeys()` function (~lines 98-114). Replace `detectEnvKeys()` call in `detectEnvironment()` with an import from `src/providers/detect.ts`:

```typescript
import { detectProviders } from "../providers/detect.js";

// Inside detectEnvironment(), replace the envKeys assignment:
  const detected = await detectProviders();
  const envKeys = detected
    .filter((d) => d.source === "env" && d.envKey)
    .map((d) => ({ provider: d.type, envVar: d.envKey!, masked: maskCredential(process.env[d.envKey!] ?? "") }));
```

Also remove the local `maskApiKey` function and import from `credentials/masking.js` instead:

```typescript
import { maskCredential } from "../credentials/masking.js";
```

- [ ] **Step 4: Gut `src/commands/setup.ts` to thin wrapper**

Keep only:
- Imports for `stepWorkspace`, `stepProject`, `stepGoal`, `stepTeam` and `WizardState`
- `runFullSetupSteps()` export that runs steps 2-5
- Remove `runSetup()`, `stepProvider()` import, `persistAllConfig()` (config is now written by `setup-flow.ts`)

```typescript
// src/commands/setup.ts — gutted
import * as p from "@clack/prompts";
import pc from "picocolors";
import { stepGoal } from "./setup/goal-input.js";
import { stepTeam } from "./setup/team-builder.js";
import { readGlobalConfig } from "../core/global-config.js";
// WizardState is defined locally since connection.ts is deleted
interface WizardState {
  providerEntries: import("../core/global-config.js").ProviderConfigEntry[];
  workspaceDir: string;
  projectName: string;
  selectedModel: string;
  goal: string;
  roster: Array<{ role: string; count: number }>;
  templateId: string;
  teamMode?: string;
}

// Steps 2-5 only, called via openpawl setup --full
export async function runFullSetupSteps(): Promise<void> {
  const state: WizardState = {
    providerEntries: readGlobalConfig()?.providers ?? [],
    workspaceDir: "",
    projectName: "",
    selectedModel: readGlobalConfig()?.activeModel ?? "",
    goal: "",
    roster: [],
    templateId: "",
  };

  p.note("Continuing with workspace, project, goal, and team setup...", pc.bold("Full Setup"));

  // Step 2: Workspace
  // (keep existing stepWorkspace inline here or import)

  // Step 3: Project
  // (keep existing stepProject inline here or import)

  // Step 4: Goal
  await stepGoal(state);

  // Step 5: Team
  await stepTeam(state);

  p.outro("Full setup complete!");
}
```

Note: The exact implementation depends on whether `stepWorkspace` and `stepProject` are extracted or kept inline. Since they're currently defined in `setup.ts` itself, keep them as local functions in this file.

- [ ] **Step 5: Update `src/commands/providers.ts` — use `detectProviders()`**

Replace the local `ENV_KEYS` map (~lines 32-57) with an import:

```typescript
import { detectProviders } from "../providers/detect.js";
import { validateApiKey } from "../providers/validate.js";
```

In `listProviders()` (~line 92), replace the env var scanning block with:

```typescript
  const detected = await detectProviders();
  const envProviders = detected.filter((d) => d.source === "env" && d.available);
  // ... format and display
```

In `addProvider()`, replace inline key validation with `validateApiKey()` call.

- [ ] **Step 6: Delete old files**

```bash
rm src/onboard/setup-wizard.ts
rm src/onboard/legacy.ts
rm src/commands/setup/connection.ts
rm src/commands/setup/composition-mode.ts
```

- [ ] **Step 7: Run full test suite**

Run: `bun run test`
Expected: all tests PASS. Some tests that imported deleted files will fail — fix by updating imports or deleting orphaned tests.

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: PASS. Fix any type errors from the refactor.

- [ ] **Step 9: Manual smoke test**

```bash
# Remove config to test first-run flow
mv ~/.openpawl/config.json ~/.openpawl/config.json.bak

# Test first-run inline setup
openpawl

# Test re-setup
openpawl setup

# Test settings
openpawl settings
openpawl settings get dashboardPort
openpawl settings set debugMode true
openpawl settings get debugMode

# Restore config
mv ~/.openpawl/config.json.bak ~/.openpawl/config.json
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: unify setup flow, consolidate provider detection, wire credential store"
```

---

## Task 8: Dedup `maskApiKey` and `handleCancel`

**Files:**
- Modify: `src/onboard/env-detector.ts` (remove local maskApiKey, already done in Task 7)
- Modify: `src/core/errors.ts` (remove maskApiKey, import from masking.ts)
- Modify: `src/commands/config.ts` (import shared handleCancel)
- Modify: `src/commands/providers.ts` (import shared handleCancel)

- [ ] **Step 1: Consolidate `maskApiKey`**

In `src/core/errors.ts`, find the local `maskApiKey` function and replace with a re-export:

```typescript
export { maskCredential as maskApiKey } from "../credentials/masking.js";
```

If other files import `maskApiKey` from `../core/errors.js`, they continue working. If any files define their own local copy, replace with the import.

- [ ] **Step 2: Extract shared `handleCancel` utility**

The pattern is identical across 3 files. Add to an existing utils file or `src/onboard/setup-flow.ts` exports it:

```typescript
// In src/onboard/setup-flow.ts (already created in Task 5), export handleCancel:
export function handleCancel<T>(value: T): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value;
}
```

Update `src/commands/config.ts` and `src/commands/providers.ts` to import:

```typescript
import { handleCancel } from "../onboard/setup-flow.js";
```

Remove their local `handleCancel` definitions.

- [ ] **Step 3: Run tests + typecheck**

Run: `bun run test && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/errors.ts src/commands/config.ts src/commands/providers.ts src/onboard/setup-flow.ts
git commit -m "refactor: dedup maskApiKey and handleCancel across codebase"
```
