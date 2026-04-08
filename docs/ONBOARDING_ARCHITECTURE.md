# Onboarding Wizard Architecture

## Overview

The onboarding flow is state-machine based and focused on a lightweight provider setup.

OpenPawl onboarding now collects only:
1. LLM Provider configuration (API key, model)
2. Dynamic team roster
3. Default goal

## State Machine Flow

```text
PROVIDER_CONFIG -> TEAM_SIZE -> TEAM_BUILDER -> GOAL -> SUMMARY -> FINISH
```

Back navigation is supported using a history stack and `<- Back` options on `select` prompts.

## Persisted Outputs

### `.env`
- Provider API keys (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

### `openpawl.config.json`
- `roster` (dynamic array: role/count/description)
- `goal`

## Notes

- Legacy gateway prompts are removed from onboarding.
- OpenPawl runtime uses the configured provider system and fails fast if no provider is available.
