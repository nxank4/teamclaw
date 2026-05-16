# OpenPawl Feature Comparison

Detailed comparison of OpenPawl against other AI coding tools.

## Quick Summary

| Feature | OpenPawl | Claude Code | OpenCode | Aider |
|---------|----------|-------------|----------|-------|
| Multi-agent orchestration | Markdown agent registry + similarity dispatch | Single agent | Single agent | Single agent |
| Cross-session memory | LanceDB vector + Hebbian | Per-project CLAUDE.md | None | Git-based |
| Post-mortem learning | Extracts & injects lessons | None | None | None |
| Inline file diffs | Colored unified diffs | Built-in | None | Git diff |
| Decision journal | Searchable, drift detection | None | None | None |
| Cost forecasting | 3 methods + learning curves | None | None | None |
| Interactive TUI | Custom (Catppuccin, mouse) | Built-in | Bubbletea | Terminal |
| Headless mode | `openpawl -p "<goal>"` | Non-interactive | CLI only | CLI only |
| Agent heatmap | Utilization + bottleneck | None | None | None |
| Session briefing | Auto-context from prior runs | None | None | None |
| Drift detection | Flags goal/decision conflicts | None | None | None |
| Replay mode | Re-run past sessions | None | None | None |
| Context compaction | `/compact` with op:compact branded summary; auto-trigger at 70% | Built-in | None | None |
| @file references | Attach files to prompts | Built-in | None | /add command |
| !command execution | Shell from TUI | Built-in | None | /run command |
| Spec/plan files `[v0.4.x]` | `./specs/` + `./plans/` git-tracked | None | None | None |

## Where Others Excel

- **Claude Code**: More mature single-agent experience, deeper IDE integration, larger community.
- **Aider**: Better git integration, wider model support, more battle-tested for solo coding.
- **OpenCode**: Simpler setup, lighter footprint.

## Where OpenPawl Excels

- Markdown-driven agent registry — custom agents are just `*.md` files in `./agents/`.
- Persistent learning across sessions (Hebbian memory + post-mortem).
- Drift detection and decision journal for long-running work.
- Branded `/compact` display with Ctrl+O / Ctrl+E expand and auto-trigger at 70% context utilization.
- Cost forecasting and agent heatmaps.
