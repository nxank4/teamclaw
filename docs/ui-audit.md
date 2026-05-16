# OpenPawl UI Audit & Fix Skill

## When to use
When improving visual quality, fixing rendering issues, or auditing
TUI components for consistency and performance.

## The Loop

```
AUDIT -> PRIORITIZE -> FIX -> VERIFY -> (repeat or done)
```

Max iterations: 5 per category
Always ask user before applying fixes.

## Phase 1: AUDIT

Run targeted audit on one or more categories:

### Category A — Render Quality
```bash
# Check for synchronized output
grep -rn "2026h\|2026l\|synchronized" src/tui/ --include="*.ts"

# Check render frequency
grep -rn "render\|repaint\|redraw\|refresh" src/tui/core/ --include="*.ts"

# Check for full vs partial updates
grep -rn "clearScreen\|fullRender\|dirtyRegion\|invalidate" src/tui/ --include="*.ts"
```
Checklist:
- [ ] Synchronized output wraps every render cycle
- [ ] Partial updates for dirty regions only
- [ ] No render triggered per keystroke during streaming
- [ ] Render time < 16ms (60fps budget)

### Category B — Information Density
Manual check with OPENPAWL_DEBUG=true:
- [ ] Tool calls collapsed when completed
- [ ] Long messages truncated with expand option
- [ ] Chat history scrollable without losing context
- [ ] Status bar shows relevant info per state
- [ ] No wasted vertical space between components

### Category C — Visual Hierarchy
```bash
# Check color usage
grep -rn "theme\.\|ctp\.\|chalk\.\|#[0-9a-f]" src/tui/components/ --include="*.ts" | head -30

# Check for hardcoded colors outside theme
grep -rn "ctp\.\|chalk\." src/tui/ src/app/ --include="*.ts" | grep -v themes/ | grep -v test
```
Checklist:
- [ ] User input visually distinct from agent response
- [ ] Tool calls visually distinct from text
- [ ] System messages visually distinct from chat
- [ ] Errors have clear visual treatment (not just red text)
- [ ] Colors use theme tokens (no hardcoded)
- [ ] Works in 16-color mode (COLORTERM=16)

### Category D — Loading & Progress
```bash
# Check for spinners
grep -rn "spinner\|createSpinner\|loading\|createSpinnerFrame" src/tui/ src/app/ --include="*.ts"

# Check for progress indicators
grep -rn "progress\|percent\|elapsed\|remaining" src/tui/ src/app/ --include="*.ts"
```
Checklist:
- [ ] Spinner during LLM thinking
- [ ] Spinner during tool execution
- [ ] Time elapsed for long operations
- [ ] No frozen/dead screen during any async operation

### Category F — Live Unified Status quality
After the crew→orchestrator unification, the chat stream is the single
surface where "what's happening now" must be readable end-to-end.

```bash
# Check op:compact rendering paths
grep -rn "COMPACT_MESSAGE_TAG\|renderCompactSummary" src/ --include="*.ts"

# Check status-bar update sites
grep -rn "statusBar\.updateSegment" src/ --include="*.ts"

# Check streaming reasoning visibility
grep -rn "thinking\|onAgentToken\|streamingForAgent" src/app/ --include="*.ts"
```
Checklist:
- [ ] One canonical place reads as "what's happening now" (status bar,
      not split between bar + chat hints)
- [ ] Tool calls collapse when completed and expand on demand
- [ ] Streaming agent tokens land in a single bubble per turn — no
      duplicate "Assistant:" headers on rapid chunks
- [ ] /compact renders the op:compact box-drawing summary; Ctrl+O and
      Ctrl+E both toggle expanded mode; theme.primary vs theme.dim
      are distinguishable in default + light themes
- [ ] Auto-trigger at 70% utilization renders the same summary inline
      without surprising the user (branded box is the cue)

### Category E — Responsiveness
```bash
# Check resize handling
grep -rn "resize\|SIGWINCH\|columns\|rows" src/tui/ --include="*.ts"

# Check escape handling
grep -rn "escape\|cancel\|abort" src/tui/ src/app/ --include="*.ts"
```
Checklist:
- [ ] Terminal resize -> layout recalculates
- [ ] Escape always responsive (not blocked by async)
- [ ] Input accepted during streaming
- [ ] Scroll smooth during long output
- [ ] Mouse scroll works if enabled

Produce audit report:
```
UI Audit Report
---
Category A (Render):       X/4 checks pass
Category B (Density):      X/5 checks pass
Category C (Hierarchy):    X/6 checks pass
Category D (Progress):     X/4 checks pass
Category F (Live Status):  X/5 checks pass
Category E (Responsive):   X/5 checks pass
---
Total: X/29

Priority fixes:
1. [highest impact, easiest fix]
2. ...
3. ...
```

## Phase 2: PRIORITIZE

Score each issue by:
- Impact: how many users affected (all vs edge case)
- Effort: lines of code to fix
- Risk: chance of breaking something

Priority = Impact x (1/Effort) x (1/Risk)

Fix highest priority first.

## Phase 3: FIX

By category:

### Render fix
- Add synchronized output if missing
- Batch renders if triggering too frequently
- Add dirty-region tracking if full repaint
- Test: no visible flicker during chat

### Density fix
- Collapse completed tool calls
- Add truncation with expand
- Remove unnecessary whitespace
- Test: more content visible per screen

### Hierarchy fix
- Replace hardcoded colors with theme tokens
- Add visual treatments (borders, indentation, weight)
- Test: readable in 16-color mode

### Progress fix
- Add spinner from status-indicator.ts
- Add progress bar for multi-step operations
- Add elapsed time display
- Test: no frozen screen during any operation

### Responsive fix
- Add/fix resize listener
- Verify Escape handler not blocked
- Test: resize during streaming, cancel during tool

Rules:
- One fix at a time
- typecheck + test after each fix
- Manual verify in terminal after each fix
- Never change business logic (visual only)

## Phase 4: VERIFY

After each fix:
```bash
bun run typecheck && bun run test && bun run build
```

Manual checks:
1. Send a prompt -> visual quality improved?
2. Run tools -> progressive feedback visible?
3. Resize terminal -> no broken layout?
4. Cancel streaming -> clean cancellation?
5. 16-color mode -> still readable?

If issue persists -> iterate (max 5)
If fixed -> next priority item

## Safety Gates

1. ALWAYS ask user before modifying source code
2. NEVER apply fix without running typecheck + tests after
3. NEVER retry same fix more than 2 times
4. NEVER modify more than 3 files in a single fix
5. STOP after 5 total iterations per category
6. NEVER change business logic to "fix" a visual issue
7. ALWAYS show the diff before applying
8. ALWAYS manual verify after each fix

## Circuit Breaker Conditions (STOP immediately)

- 3 consecutive iterations with no file changes -> stuck
- Same visual issue persists after 2 fix attempts -> approach is wrong
- Test count drops (fix broke something) -> revert and stop
- Fix touches > 5 files -> too complex, needs human planning

## Reusable Commands

### Quick render audit
```bash
grep -rn "2026h\|clearScreen\|fullRender" src/tui/ --include="*.ts"
```

### Quick color audit
```bash
grep -rn "ctp\.\|chalk\.\|#[0-9a-f]\{6\}" src/tui/ src/app/ --include="*.ts" | grep -v themes/ | grep -v test | grep -v node_modules
```

### Quick progress audit
```bash
grep -rn "spinner\|loading\|progress\|idle" src/tui/ src/app/ --include="*.ts" | grep -v test
```

### Visual regression check
```bash
# Capture baseline
OPENPAWL_DEBUG=true openpawl -p "hello"
openpawl logs debug --source tui --session latest
```
