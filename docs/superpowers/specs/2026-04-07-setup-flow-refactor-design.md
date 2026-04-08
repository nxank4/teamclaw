# Setup Flow Refactor — Design Spec

**Date:** 2026-04-07
**Approach:** Refactor-in-place (Approach 3 — detection in `src/providers/`, wizard in `src/onboard/`)

## Problem

OpenPawl has two disconnected setup wizards:

1. `src/onboard/setup-wizard.ts` — simplified 4-question first-run path
2. `src/commands/setup.ts` + `src/commands/setup/connection.ts` — full 5-step wizard

The CLI routes `openpawl setup` through the simplified one via `handleFirstRun()`. The `config` command's "Setup required" branch uses the full one. They share no code. Additionally:

- ENV_KEY_MAP is duplicated in 4 files (`provider-factory.ts`, `providers.ts`, `env-detector.ts`, `credential-store.ts`)
- API keys are stored in plaintext in `~/.openpawl/config.json`, bypassing the existing `CredentialStore`
- `maskApiKey` is implemented 3 times in different files
- Config writes are atomic in `onboard/config-writer.ts` but not in `global-config.ts`

## Goals

1. First-run setup happens inline when user runs `openpawl` (no config detected)
2. `openpawl setup` re-runs the same flow with pre-filled values
3. Granular reconfiguration: `providers`, `model`, `settings` commands
4. Single source of truth: `~/.openpawl/config.json`
5. Dynamic model lists fetched from provider APIs
6. API keys stored securely via `CredentialStore`

## Architecture

### Domain Separation

**`src/providers/`** owns "what providers exist and how to talk to them":
- `provider-catalog.ts` — canonical provider definitions (existing, unchanged)
- `detect.ts` — **new**, unified provider detection replacing 4 scattered copies
- `validate.ts` — **new**, API key validation extracted from `connection.ts`
- `model-fetcher.ts` — live model list fetching (existing, unchanged)
- `model-cache.ts` — model list caching (existing, unchanged)
- `provider-factory.ts` — provider instantiation (existing, updated to use `CredentialStore`)

**`src/onboard/`** owns "how to walk a user through setup":
- `setup-flow.ts` — **new**, unified setup wizard replacing both existing wizards
- `config-writer.ts` — atomic config writing (existing, unchanged)
- `first-run.ts` — simplified to just call `runSetup()` (existing, gutted)
- `env-detector.ts` — project type detection only, provider detection extracted out (existing, slimmed)

**`src/commands/`** stays as thin CLI wrappers.

## New Files

### `src/providers/detect.ts` (~80 LOC)

```typescript
interface DetectedProvider {
  type: string;           // provider key from PROVIDER_CATALOG
  available: boolean;
  models?: string[];      // pre-fetched for local providers
  source: 'env' | 'ollama' | 'lmstudio' | 'config';
  envKey?: string;        // which env var was found
}

function detectProviders(): Promise<DetectedProvider[]>
```

- Derives env key scanning from `PROVIDER_CATALOG[*].envKeys` — no hardcoded map
- Probes Ollama (`GET http://localhost:11434/api/tags`) and LM Studio (`GET http://localhost:1234/v1/models`) in parallel via `Promise.allSettled`
- 3-second timeout per probe
- Checks existing config for already-configured providers
- Returns all results sorted: available first

### `src/providers/validate.ts` (~50 LOC)

```typescript
function validateApiKey(type: string, key: string): Promise<Result<{ latencyMs: number }, ValidationError>>
```

- Per-provider health check using lightweight endpoints:
  - Anthropic: `GET /v1/models`
  - OpenAI-compatible: `GET /v1/models`
  - Ollama: `GET /api/tags`
- Returns latency on success for the summary display
- Uses `neverthrow` Result type
- Extracted from `connection.ts`'s inline validation logic

### `src/onboard/setup-flow.ts` (~250 LOC)

```typescript
interface SetupOptions {
  prefill?: OpenPawlGlobalConfig;  // existing config for re-setup
}

function runSetup(options?: SetupOptions): Promise<void>
```

**Flow:**
1. `detectProviders()` → display results with checkmarks/dots
2. `@clack/prompts.select()` → pick provider (detected sorted to top, current marked if re-setup)
3. If needs API key → `@clack/prompts.password()` → `validateApiKey()` → `CredentialStore.setCredential()`
4. `fetchModelsForProvider()` → `@clack/prompts.select()` → pick model
5. Verify connection → show latency
6. `writeGlobalConfig({ activeProvider, activeModel, providers })` → show summary box

**Re-setup behavior:** When `prefill` is provided, every prompt shows `(current)` label on the active selection. User presses Enter to keep. Changing provider clears model and re-fetches.

**Cancel handling:** Shared `handleCancel` utility (extracted from the 3 local copies).

### `src/commands/settings.ts` (~80 LOC)

```
openpawl settings                  → formatted table of all settings
openpawl settings get <key>        → dot-notation read
openpawl settings set <key> <val>  → dot-notation write with type coercion
openpawl settings reset            → confirm → write defaults
```

Reads/writes through `readGlobalConfigWithDefaults()` / `writeGlobalConfig()`. Supported keys: `dashboardPort`, `debugMode`, `tokenOptimization`, `timeouts.*`, `dashboard.*`, `work.*`, `streaming.*`, `personality.*`, `handoff.*`. Invalid keys get fuzzy-match suggestion.

## Modified Files

### `src/core/global-config.ts`

**Schema additions:**
- `activeProvider: string` — explicit active provider key (currently implied by array order)
- `activeModel: string` — explicit active model (currently `model` field used inconsistently)
- `ProviderConfigEntry` gains `hasCredential: boolean` — replaces plaintext `apiKey`

**Migration in `normalizeGlobalConfig()`:** On read, if a provider entry has `apiKey` set:
1. Move key to `CredentialStore.setCredential(type, "apiKey", key)`
2. Set `hasCredential: true`
3. Strip `apiKey` from the entry
4. Write back the cleaned config

This is a one-time migration — subsequent reads see `hasCredential: true` and resolve keys through `CredentialStore`.

### `src/providers/provider-factory.ts`

**`providerFromConfig(entry)`** updated:
- Uses `CredentialStore.resolveApiKey(entry.type)` (env var → store → null) instead of reading `entry.apiKey`
- Existing `discoverFromEnv()` replaced with import from `detect.ts`

### `src/commands/setup.ts` (551 → ~30 LOC)

Step 1 (provider+model) replaced by call to `runSetup()`. Steps 2-5 (workspace, project, goal, team) stay in this file — they're only used here and are orthogonal to provider setup.

```typescript
export async function runSetupCommand(args: string[]) {
  const existing = readGlobalConfig();
  // Step 1: Provider + model (unified flow)
  await runSetup({ prefill: existing ?? undefined });
  // Steps 2-5 only run with --full flag
  if (args.includes("--full")) {
    await stepWorkspace(state);
    await stepProject(state);
    await stepGoal(state);
    await stepTeam(state);
  }
}
```

### `src/onboard/first-run.ts` (97 → ~20 LOC)

```typescript
export async function handleFirstRun(): Promise<void> {
  await runSetup();
}
```

### `src/onboard/env-detector.ts` (191 LOC → ~80 LOC)

Provider detection logic extracted to `src/providers/detect.ts`. Retains project type detection (package.json, Cargo.toml, pyproject.toml sniffing) since that's not provider-related.

### `src/commands/providers.ts` (598 → ~500 LOC)

`addProvider` refactored to use `detectProviders()` and `validateApiKey()` from `src/providers/`. Removes local `ENV_KEYS` map and inline validation. `list` uses `detectProviders()` for status column.

### `src/cli.ts`

First-run detection (lines 136-163) updated:
```
if no args && TTY:
  if no ~/.openpawl/config.json:
    await runSetup()      // inline first-run
  launchTUI()
```

`setup` command handler calls `runSetup({ prefill: existingConfig })`.

New `settings` command registered in the dispatch chain.

## Deleted Files

| File | LOC | Reason |
|------|-----|--------|
| `src/onboard/setup-wizard.ts` | 387 | Replaced by unified `setup-flow.ts` |
| `src/onboard/legacy.ts` | 14 | Shim to old `runOnboard`, no longer needed |
| `src/commands/setup/connection.ts` | 516 | Provider+model logic moves to `setup-flow.ts` |
| `src/commands/setup/composition-mode.ts` | 37 | Only used by `connection.ts`, not needed for provider setup |

## Credential Store Integration

The existing `src/credentials/credential-store.ts` is already built with the right API:
- `setCredential(provider, "apiKey", key)` — stores securely (keychain on macOS, AES-256-GCM encrypted file on Linux)
- `resolveApiKey(provider)` — env var → store → null fallback
- `getProviderCredentials(provider)` — returns all credentials for a provider

Currently bypassed — setup writes keys to config JSON in plaintext. This refactor wires the store into:
1. `setup-flow.ts` — writes keys to store during setup
2. `provider-factory.ts` — reads keys from store at runtime
3. `providers.ts` `addProvider` — writes keys to store

Config JSON stores `hasCredential: true` as a flag, never the actual key.

## Deduplication Summary

| Duplicated Code | Current Locations | Consolidated To |
|-----------------|-------------------|-----------------|
| ENV_KEY_MAP | `provider-factory.ts`, `providers.ts`, `env-detector.ts`, `credential-store.ts` | `providers/detect.ts` (derives from `PROVIDER_CATALOG.envKeys`) |
| `maskApiKey` | `credentials/masking.ts`, `onboard/env-detector.ts`, `core/errors.ts` | `credentials/masking.ts` (others import from here) |
| `handleCancel` | `connection.ts`, `config.ts`, `providers.ts` | `src/utils/cancel.ts` or inline in `setup-flow.ts` |
| API key validation | `connection.ts`, `providers.ts` | `providers/validate.ts` |
| Provider detection | `env-detector.ts`, `provider-factory.ts` | `providers/detect.ts` |

## Net Impact

- ~950 LOC deleted
- ~460 LOC new (`setup-flow.ts` ~250, `detect.ts` ~80, `validate.ts` ~50, `settings.ts` ~80)
- ~200 LOC reduced from deduplication in existing files
- One setup path instead of two
- API keys secured via credential store
- ENV scanning derived from single source (`PROVIDER_CATALOG`)

## Testing

- Unit tests for `detect.ts` — mock HTTP calls for Ollama/LM Studio probes, mock `process.env` for key scanning
- Unit tests for `validate.ts` — mock provider health endpoints, test timeout handling
- Unit tests for `settings.ts` — get/set/reset with type coercion
- Integration test for `setup-flow.ts` — mock `@clack/prompts` inputs, verify config output
- Test config migration — old config with plaintext `apiKey` → `hasCredential: true` + key in store
- Test credential store integration in `provider-factory.ts`
