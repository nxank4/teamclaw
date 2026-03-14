# Security Policy

TeamClaw is a Node.js / TypeScript application that orchestrates AI agent teams using LangGraph, Fastify + WebSocket, LanceDB, and the OpenClaw gateway. This document covers how we handle security and how to report issues responsibly.

## Supported Versions

TeamClaw is in early development (pre-1.0). Security fixes target the latest code on the default branch only.

| Version | Status        |
| ------: | ------------- |
|   0.1.x | Supported     |
|   < 0.1 | Not supported |

## Reporting a Vulnerability

**Do not open a public GitHub issue or PR describing a security vulnerability.**

Instead, use one of these channels:

1. GitHub's **"Report a vulnerability"** feature on this repository (creates a private security advisory).
2. If unavailable, contact the maintainers via the repository or owner profile and mark your message as security-sensitive.

### What to Include

- Description of the issue and its potential impact
- Steps to reproduce (sample config, commands, logs with secrets redacted)
- Version or commit hash, Node.js version, and OS
- Suggested fixes or mitigations, if any

### Response Timeline

- **Acknowledgement:** within 7 calendar days
- **Follow-up:** within 14 calendar days (confirmation + ETA for a fix, request for more info, or scope determination)
- **Advisory:** once a fix ships, we may publish a security advisory covering affected versions, severity, and upgrade steps

We prefer to coordinate responsible disclosure so users have time to upgrade before technical details are public.

## Threat Model

TeamClaw has several trust boundaries worth understanding:

### OpenClaw Gateway

All LLM traffic routes through OpenClaw (`OPENCLAW_WORKER_URL` + `OPENCLAW_TOKEN`). A compromised or man-in-the-middle gateway can inject arbitrary content into agent responses. Always connect over TLS and restrict network access to trusted endpoints.

### WebSocket / Fastify Server

The web dashboard (`pnpm run web`) binds a Fastify server with WebSocket on the configured port (default 8000). This server is intended for local or trusted-network use only. It has no authentication layer. If exposed to an untrusted network, any client can observe and interact with running sessions.

### Agent Output and Prompt Injection

Agents process untrusted content (user goals, external data fetched during tasks). Treat all agent-generated output — file writes, shell commands, summaries — as potentially influenced by prompt injection. Review agent actions before applying them to production systems.

### Configuration and Secrets

TeamClaw stores configuration in a JSON file (`~/.teamclaw/config.json`). This file may contain API tokens. Ensure it has restrictive file permissions (`600`) and is never committed to version control. The `.env.example` file documents required variables; use `.env` for local overrides.

### LanceDB (Embedded)

LanceDB runs in-process with no network listener. The vector store files live on the local filesystem. Protect the data directory with appropriate file permissions if it contains sensitive session history.

## Best Practices for Deployers

- **Runtime:** use Node.js >= 20 and keep dependencies current via `pnpm update`. Review advisories with `pnpm audit`.
- **Secrets:** never commit real API keys or tokens. Use `.env` or environment variables.
- **Network:** bind the Fastify/WebSocket server to `127.0.0.1` or a trusted subnet. Do not expose it to the public internet without adding authentication and TLS.
- **Least privilege:** run TeamClaw under a dedicated, unprivileged user account with minimal filesystem access.
- **Containers:** prefer containerized or sandboxed deployments to limit blast radius.
- **Monitoring:** watch logs for unusual activity; configure rate-limiting at your ingress layer if exposing any endpoint externally.

## Out of Scope

- Vulnerabilities in third-party dependencies without a published fix (we track and patch once available).
- Attacks requiring physical access to the host or social engineering of maintainers/users.
- Misconfigurations in your own infrastructure (cloud provider, Kubernetes, CI/CD) unrelated to defects in TeamClaw's code.

If unsure whether something qualifies, submit a private report anyway — we will let you know.
