# OpenPawl Auto Debug Skill

## When to use
When OpenPawl has a bug or feature that needs investigation,
fix, and verification. This skill implements an autonomous
debug loop with safety gates.

## The Loop

```
DETECT -> DIAGNOSE -> FIX -> VERIFY -> (repeat or done)
```

Max iterations: 5
Max same-error retries: 2
Always ask user before applying fix.

## Phase 1: DETECT

Run the failing scenario with full debug logging:
```bash
cd ~/personal/openpawl-test-projects/auto-debug-$(date +%s)
OPENPAWL_DEBUG=true OPENPAWL_PROFILE=true openpawl -p "<goal>"
```

Capture:
- Exit code
- Debug log (JSONL)
- Profile report
- stdout/stderr
- Generated files

If exit code = 0 and output looks correct -> DONE (no bug)

## Phase 2: DIAGNOSE

Read debug logs systematically:
```bash
# 1. Errors first
openpawl logs debug --session latest --level error

# 2. Timeline around the error
openpawl logs debug --session latest --timeline

# 3. Specific source
openpawl logs debug --session latest --source <source of error>

# 4. LLM prompts/responses if output quality issue
openpawl logs debug --session latest --source llm
```

Produce a diagnosis:
```
ROOT CAUSE: [one sentence]
EVIDENCE: [log entries that prove it]
SOURCE FILE: [exact file and function]
FIX CATEGORY: [prompt|logic|wiring|parsing|rendering]
CONFIDENCE: [high|medium|low]
```

If confidence = low -> ASK USER for more context before proceeding.

## Phase 3: FIX

Based on diagnosis category:

### prompt fix
- Read the agent's system prompt from source
- Identify what's missing or misleading
- Propose specific prompt changes
- ASK USER: "Modify prompt in <file>:<line>? [Y/n]"

### logic fix
- Read the source function
- Identify the bug (off-by-one, wrong condition, missing case)
- Propose minimal code change
- ASK USER: "Apply this fix to <file>? [Y/n]"

### wiring fix
- Trace event flow from emitter to listener
- Identify where the chain breaks
- Propose wiring change
- ASK USER: "Wire <event> in <file>? [Y/n]"

### parsing fix
- Check safeJsonParse layers
- Check what the LLM actually returned (from debug log)
- Propose parsing improvement
- ASK USER: "Add parsing fallback in <file>? [Y/n]"

### rendering fix
- Check component that renders the output
- Identify where data is lost or malformed
- Propose display fix
- ASK USER: "Fix rendering in <file>? [Y/n]"

RULES:
- Fix must be < 50 lines changed
- If fix is > 50 lines -> decompose into smaller atomic fixes
- Each atomic fix gets its own verify cycle
- Never change test assertions to hide bugs
- Never delete features to avoid bugs

## Phase 4: VERIFY

After fix is applied:
```bash
# 1. Type check
bun run typecheck

# 2. Tests
bun run test

# 3. Re-run the EXACT same scenario
cd ~/personal/openpawl-test-projects/auto-debug-verify-$(date +%s)
OPENPAWL_DEBUG=true openpawl -p "<same goal>"

# 4. Compare logs
openpawl logs debug --session latest --level error
# Should be: no errors (or different errors)
```

If same error -> increment retry counter
If retry counter >= 2 for same error -> STOP, report to user:
"Tried 2 times, same error persists. Root cause may be deeper."

If different error -> new DETECT cycle (max 5 total iterations)
If no errors + output correct -> DONE

## Phase 5: REPORT

After loop completes (success or max iterations):
```markdown
# Auto Debug Report

## Issue
[original problem description]

## Iterations
| # | Phase | Action | Result |
|---|-------|--------|--------|
| 1 | DETECT | ran multi-file feature goal | error in orchestrator dispatcher |
| 1 | DIAGNOSE | JSON parse failure at safe-json-parse.ts:42 | confidence: high |
| 1 | FIX | added safeJsonParse fallback | APPLIED (user approved) |
| 1 | VERIFY | re-ran same scenario | PASS |

## Root Cause
[explanation]

## Fix Applied
[file + diff summary]

## Regression Check
- typecheck: pass
- tests: 475 pass, 0 fail
- original scenario: pass
```

## Safety Gates

1. ALWAYS ask user before modifying source code
2. NEVER apply fix without running typecheck + tests after
3. NEVER retry same fix more than 2 times
4. NEVER modify more than 3 files in a single fix
5. STOP after 5 total iterations regardless of outcome
6. NEVER delete existing functionality to "fix" a bug
7. ALWAYS show the diff before applying
8. ALWAYS re-run the exact same scenario to verify

## Circuit Breaker Conditions (STOP immediately)

- 3 consecutive iterations with no file changes -> stuck
- Same error text appears 3 times -> fix approach is wrong
- Test count drops (fix broke something) -> revert and stop
- Fix touches > 5 files -> too complex, needs human planning

## Integration with OpenPawl Debug Logs

The debug logs are the primary diagnostic tool. Pattern:
1. --level error -> find the failure
2. --timeline -> understand sequence
3. --source <X> -> zoom into failing subsystem
4. --source llm -> check prompt/response quality
5. --grep <keyword> -> find specific events

## Example Usage

User says: "Dispatcher picks the wrong agent for 'fix the auth bug'"

Iteration 1:
- DETECT: `OPENPAWL_DEBUG=true openpawl -p "fix the auth bug"`
- DIAGNOSE: `openpawl logs debug --source orchestrator --event dispatch_chosen`
  -> chose architect, not builder; sources=["keyword"]; embedder unreachable
- Look at agent triggers: `cat src/agents/builtin/architect.md`
  -> trigger word "fix" matched on architect's "compare options / tradeoff" verbs
- ROOT CAUSE: "fix" missing from builder.md triggers; embedder offline so no
  description-based similarity could override the false keyword match
- FIX: add "fix" + "debug" to builder.md triggers; rebuild
- ASK USER -> approved
- VERIFY: re-run same scenario -> dispatcher chooses builder -> DONE
