# OpenPawl Test Runner Skill

## When to use
When testing OpenPawl features, debugging issues, or verifying fixes.

## How to run OpenPawl

### Headless mode (preferred for testing):
```bash
cd ~/personal/openpawl-test-projects/<test-name>
OPENPAWL_DEBUG=true openpawl -p "<goal text>"
```

The orchestrator chooses agents from the markdown registry based on
similarity match against the goal. To force a specific agent, mention
it: `openpawl -p "@architect plan the auth flow"`.

### Read debug logs after run:
```bash
# Latest session logs
cat ~/.openpawl/debug/$(ls -t ~/.openpawl/debug/ | head -1)

# Filter errors only
cat ~/.openpawl/debug/$(ls -t ~/.openpawl/debug/ | head -1) | jq 'select(.level == "error")'

# Filter by source
cat ~/.openpawl/debug/$(ls -t ~/.openpawl/debug/ | head -1) | jq 'select(.source == "orchestrator")'

# Timeline of events
cat ~/.openpawl/debug/$(ls -t ~/.openpawl/debug/ | head -1) | jq '{time: .timestamp, event: .event, source: .source, error: .error}'
```

### Use the built-in log viewer:
```bash
# Latest session, last 50 entries
openpawl logs debug

# Compact timeline view
openpawl logs debug --timeline

# Filter by level
openpawl logs debug --level error

# Filter by source (router, orchestrator, tool, llm, memory, session, error, tui)
openpawl logs debug --source orchestrator

# Filter by event name
openpawl logs debug --event subagent_returned

# Search across all fields
openpawl logs debug --grep "Write"

# Raw JSON for piping
openpawl logs debug --json | jq .

# Follow live
openpawl logs debug -f
```

### Check output:
```bash
# What files were created
ls -la ~/personal/openpawl-test-projects/<test-name>/

# Profile report (if OPENPAWL_PROFILE=true)
cat ~/.openpawl/profile-report.md
```

## Test scenarios

### Scenario 1: Single-agent task
```bash
cd ~/personal/openpawl-test-projects/test-single
OPENPAWL_DEBUG=true openpawl -p "Create a hello world Express server"
```
Expected: dispatcher picks `builder`, 1 file created, < 60s.

### Scenario 2: Review path
```bash
cd ~/personal/openpawl-test-projects/test-review
OPENPAWL_DEBUG=true openpawl -p "Review src/auth.ts for race conditions"
```
Expected: dispatcher picks `reviewer`, read-only tool calls, no writes.

### Scenario 3: Architecture path
```bash
cd ~/personal/openpawl-test-projects/test-arch
OPENPAWL_DEBUG=true openpawl -p "Plan a queue-backed background job system"
```
Expected: dispatcher picks `architect`, plan output, no writes.

### Scenario 4: Forced agent via mention
```bash
cd ~/personal/openpawl-test-projects/test-mention
OPENPAWL_DEBUG=true openpawl -p "@tester add coverage for date.ts"
```
Expected: mention overrides similarity match, `tester` dispatched.

### Scenario 5: Compaction stress
```bash
cd ~/personal/openpawl-test-projects/test-compact
OPENPAWL_DEBUG=true OPENPAWL_PROFILE=true openpawl
# Send many prompts to fill context >70%, observe op:compact auto-trigger
```
Expected: op:compact summary appears inline before later prompts;
Ctrl+O / Ctrl+E toggle expanded mode.

## Debug workflow

1. Run a scenario.
2. If it fails or output is wrong:
   a. Read debug logs: filter errors first, then timeline.
   b. Identify: which event/source failed?
   c. Read the source file for that event handler.
   d. Propose fix (ALWAYS ask user before applying).
   e. Apply fix, re-run same scenario.
   f. Compare logs: is the error gone?
3. If output is correct but quality is poor:
   a. Read debug logs: check LLM prompts and responses.
   b. Check: are agent system prompts (in markdown frontmatter +
      body) well-structured?
   c. Check: is the right agent being dispatched?
      (orchestrator → dispatch_chosen event).
   d. Propose prompt improvement (ask user first).

## Log analysis patterns

### Find why a dispatch failed:
```bash
cat <logfile> | jq 'select(.source == "orchestrator" and .level == "error")'
```

### Find slow operations:
```bash
cat <logfile> | jq 'select(.duration > 5000) | {event, source, duration}'
```

### Find LLM token usage:
```bash
cat <logfile> | jq 'select(.source == "llm") | {event, data.inputTokens, data.outputTokens}'
```

### Find tool errors:
```bash
cat <logfile> | jq 'select(.source == "tool" and .level == "error")'
```

### Find which agent was chosen and why:
```bash
cat <logfile> | jq 'select(.event == "dispatch_chosen") | {chosen: .data.chosen, sources: .data.sources, fallback_used: .data.fallback_used}'
```

### Full event timeline:
```bash
cat <logfile> | jq -r '"\(.timestamp | split("T")[1] | split(".")[0]) [\(.source)] \(.event) \(if .error then "ERROR: " + .error else "" end)"'
```

## Rules
- ALWAYS run with `OPENPAWL_DEBUG=true` when testing.
- ALWAYS read logs before proposing fixes.
- ALWAYS ask user before modifying source code.
- NEVER modify test assertions to hide failures.
- NEVER skip re-running the scenario after a fix.
- Compare logs before and after fix to verify.
