# OpenPawl Debug Patterns

## When to use
When diagnosing bugs, investigating failures, or understanding
unexpected behavior.

## Quick Diagnosis Commands

### "Why did the dispatch fail?"
```bash
OPENPAWL_DEBUG=true openpawl -p "..."
openpawl logs debug --source orchestrator --level error
openpawl logs debug --source orchestrator --event "subagent_returned"
```

### "Why is it slow?"
```bash
OPENPAWL_PROFILE=true OPENPAWL_DEBUG=true openpawl -p "..."
cat ~/.openpawl/profile-report.md
openpawl logs debug --source llm | grep duration
```

### "Why did the agent write bad code?"
```bash
openpawl logs debug --source llm --event "request"
# Check: what prompt did it receive?
# Check: was memory context injected?
# Check: were lessons included?
```

### "Why did the orchestrator pick the wrong agent?"
```bash
openpawl logs debug --source orchestrator --event "dispatch_chosen"
# Check: sources field (embedding vs keyword fallback)
# Check: chosen array — which agents and in what order
# Check: was the embedder reachable, or did fallback kick in?
```

### "Why is status bar stuck on idle?"
```bash
openpawl logs debug --source tui --event "status"
# Check: state transitions
# If no entries: events not reaching TUI wiring
```

### "Why did memory not help?"
```bash
openpawl logs debug --source memory
# Check: was retrieval called?
# Check: results count and scores
# Check: was context injected into prompt?
openpawl logs debug --source llm --event "memory_context"
```

## Common Bugs and Fixes

### Raw JSON in tool output
Cause: diff object passed as text instead of through renderer
Fix: check formatToolResult() is called before display
Files: tool-call-view.ts, messages.ts

### Broken newlines during streaming
Cause: word wrap recalculated on partial chunks
Fix: buffer until paragraph boundary or stream end
Files: messages.ts, markdown.ts

### Config not syncing across views
Cause: reading from different sources
Fix: all reads go through globalConfig, emit change event on write
Files: global-config.ts, settings-view.ts, model-view.ts

### Subagent fails the capability gate unexpectedly
Cause: tool name not in agent's `tools.allow` list
Fix: edit `src/agents/builtin/<name>.md` frontmatter (or the user-local
override at `~/.openpawl/agents/<name>.md`) to include the tool
Files: src/orchestrator/capability-gate.ts, src/agents/builtin/*.md

### Token counter not showing
Cause: dispatch:done handler overwritten by another handler
Fix: check handler chain, ensure token segment not clobbered
Files: router-wiring.ts, agent-display.ts

### Builtin agents missing in built binary
Cause: dist/ never received the markdown files
Fix: rerun `bun run build` — tsup.config.ts onSuccess copies them
Files: tsup.config.ts, src/agents/registry/markdown-registry.ts
