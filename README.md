# TeamClaw: OpenClaw Team Orchestration

Build AI bot teams for company-like work. Define goals and teams (programmers, artist, SFX, etc.); OpenClaw workers execute tasks via LangGraph. Optional multi-run mode learns from failed runs via RAG (ChromaDB or JSON fallback).

## Quick Start (Node)

```bash
pnpm install
pnpm run build

# Web UI (http://localhost:8000)
pnpm run web

# Work sessions (starts web dashboard automatically)
pnpm run work
teamclaw work --runs 5   # Multi-run with lesson learning
teamclaw work            # CLI-only (no dashboard)
```

**Requirements:** Node.js >= 20, [pnpm](https://pnpm.io). For local dev without OpenClaw: `ollama pull qwen2.5-coder:7b`.

## Overview

- **Coordinator** — Decomposes user goals into subtasks, assigns by role
- **WorkerBots** — Execute tasks via OpenClaw (RealSparki) or Ollama (MockSparki for local dev)
- **Team Templates** — Game Dev, Startup, Content
- **Vector Memory** — RAG over lessons (ChromaDB or JSON fallback)
- **Web UI** — Real-time workflow at http://localhost:8000

## Project Structure

```
src/
├── core/           # State, config, orchestration, knowledge-base
├── agents/         # Coordinator, WorkerBot, Analyst
├── interfaces/     # Sparki SDK (RealSparki / MockSparki)
├── web/            # Fastify server + static terminal.html
├── cli.ts          # CLI entry
└── work-runner.ts  # Work session logic
```

## First-time Setup

1. **Onboarding** (recommended): Run `teamclaw onboard` for an interactive wizard that sets up worker URL, team template, goal, and optionally the LiteLLM gateway. If you enable LiteLLM, it writes `GATEWAY_URL`, `TEAM_MODEL`, and `LITELLM_CONFIG_PATH` to `.env` and generates `llm-config.yaml` if missing. Then run `teamclaw gateway start` (or `docker compose --profile gateway up`) and ensure those env vars are loaded. Re-running onboarding is idempotent and preserves existing gateway settings.
2. **Web UI**: Run `pnpm run web` and set **OpenClaw Worker URL** in the splash screen before starting. Leave empty for local Ollama (MockSparki).
3. **Config file**: Copy `teamclaw.config.example.json` to `teamclaw.config.json` and set `workers` or use a single `OPENCLAW_WORKER_URL` in `.env`.
4. **.env** (advanced): Copy `.env.example` to `.env` for env-only overrides.

## Team Configuration

- **Templates**: `game_dev`, `startup`, `content` (Web UI or `teamclaw.config.json`).
- **Config file** (`teamclaw.config.json`): `template`, `workers` (per-bot URLs), `goal`, `creativity` (0–1).
- **Precedence**: Web UI worker URL > `teamclaw.config.json` workers > `OPENCLAW_WORKER_URL` env.

## Environment (.env)

Copy `.env.example` to `.env`. Key variables:

- `OLLAMA_MODEL`, `OLLAMA_BASE_URL` — LLM (MockSparki / Coordinator)
- `CREATIVITY`, `MAX_CYCLES`, `MAX_RUNS` — Session defaults
- `OPENCLAW_WORKER_URL` — Fallback worker URL (prefer Web UI or config)
- `CHROMADB_PERSIST_DIR` — Vector store path

## Docker & One-Click Deploy

All services use the shared network `teamclaw-net`. Internal hostnames: `chromadb`, `ollama`, `openclaw`.

```bash
docker compose up                                    # Web + ChromaDB
docker compose --profile ollama up                   # + Ollama (LLM)
docker compose --profile openclaw up                 # + OpenClaw worker
docker compose --profile ollama --profile openclaw up   # Full stack
```

When using the **openclaw** profile, set in `.env`:

- `OPENCLAW_WORKER_URL=http://openclaw:3000` so TeamClaw can reach OpenClaw inside the network.

Optionally set `OPENCLAW_IMAGE` to your OpenClaw worker image (default: `openclaw/worker:latest`). The OpenClaw container may need GUI-related options (e.g. `shm_size: '2g'`, VNC port for debugging); see comments in `docker-compose.yml` and `docs/OPENCLAW_PROVISIONING.md`.

## AI Gateway (LiteLLM)

TeamClaw and OpenClaw can share one LLM proxy so you configure API keys and models in a single place. If you used `teamclaw onboard` and enabled LiteLLM, run `teamclaw gateway start` (or `docker compose --profile gateway up`) and ensure `GATEWAY_URL` / `TEAM_MODEL` are exported in `.env`.

**Terminal-first:** In one terminal start the gateway, then run TeamClaw with it:

```bash
teamclaw gateway start
# In another terminal:
export GATEWAY_URL=http://localhost:4000
export TEAM_MODEL=team-default
pnpm run web
# or: pnpm run work
```

Edit `llm-config.yaml` to add models (Ollama, OpenAI, Claude, Gemini, etc.). Use `TEAM_MODEL` to match a `model_name` in that file. Override config path with `LITELLM_CONFIG_PATH` or `teamclaw gateway start --config /path/to/config.yaml`.

**Docker:** `docker compose --profile gateway up` runs the LiteLLM container. In `.env` set `GATEWAY_URL=http://litellm:4000` and `TEAM_MODEL=team-default` so TeamClaw and OpenClaw use the gateway inside the network.

## License

MIT
