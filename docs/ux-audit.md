# OpenPawl UX Audit & Fix Skill

## When to use
When improving user experience, flow, discoverability, error handling,
or onboarding. Focuses on how it FEELS, not how it LOOKS.

## The Loop

```
OBSERVE -> IDENTIFY -> IMPROVE -> VALIDATE -> (repeat or done)
```

Max iterations: 5 per journey
Always ask user before applying changes.

## Phase 1: OBSERVE

Test each user journey end-to-end, noting friction points:

### Journey 1: First-time user
```bash
# Simulate fresh install (backup config first)
mv ~/.openpawl/config.json ~/.openpawl/config.json.bak
openpawl
# Restore after
mv ~/.openpawl/config.json.bak ~/.openpawl/config.json
```
Checklist:
- [ ] Clear what to do first (not blank screen)
- [ ] Provider detection automatic
- [ ] Time to first successful prompt < 60 seconds
- [ ] No cryptic error messages
- [ ] Hints guide user to next feature

### Journey 2: Daily developer workflow
```bash
openpawl
# Send: "explain the auth module"
# Send: "add rate limiting to it"
# Send: "write tests for rate limiter"
# /sessions to check history
```
Checklist:
- [ ] Context carries between prompts (no re-explain)
- [ ] Session auto-saves
- [ ] Can resume where left off
- [ ] Token cost visible
- [ ] /compact runs cleanly when context fills; auto-trigger at 70%
      lands without surprising the user

### Journey 3: Spec-driven feature `[v0.4.x]`
```bash
openpawl
# Send: "Add OAuth2 PKCE flow across auth + session modules"
# OpenPawl auto-generates ./specs/<slug>.md and opens it in $EDITOR
# User edits / approves the spec
# OpenPawl generates ./plans/<slug>.md
# User approves the plan
# Orchestrator executes, drift-supervisor checks alignment at each phase
# User reviews diffs, accepts or asks for revisions
```
Checklist:
- [ ] Multi-file goal triggers spec generation `[v0.4.x]`
- [ ] Spec is editable before approval (git-tracked at ./specs/<slug>.md)
- [ ] Plan is editable before approval (git-tracked at ./plans/<slug>.md)
- [ ] Live status visible during execution (op:compact + status bar)
- [ ] Drift checkpoint surfaces when the implementation diverges from
      the approved spec `[v0.4.x]`
- [ ] Generated plan can be re-run later without re-prompting

### Journey 4: Configuration
```bash
openpawl
# /settings -> change provider
# /model -> switch model
# /agents -> view or edit custom agents
# /compact -> show context state + compact if needed
```
Checklist:
- [ ] Navigation between views is seamless (no dead ends)
- [ ] Changes take effect immediately (no restart)
- [ ] Back navigation (Esc) works everywhere
- [ ] Current state visible at all times (status bar)
- [ ] Undo if wrong change

### Journey 5: Error recovery
```bash
# Disconnect network -> send prompt
# Send vague goal
# Cancel mid-stream -> send new prompt
# Send to wrong model
```
Checklist:
- [ ] Error messages have actionable next steps
- [ ] Recovery doesn't require restart
- [ ] Partial work preserved after error
- [ ] User can retry without re-typing

### Journey 6: Power user
```bash
# Keyboard shortcuts for everything
# Mode cycling speed
# Filter in large lists
# Custom agents workflow
# Template selection speed
```
Checklist:
- [ ] All features reachable by keyboard only
- [ ] No more than 3 keystrokes to any feature
- [ ] Shortcuts shown in context (not memorization)
- [ ] Advanced features don't clutter basic flow
- [ ] /hotkeys is complete and accurate

Produce UX report:
```
UX Audit Report
---
Journey 1 (First-time):     X/5 smooth
Journey 2 (Daily):          X/5 smooth
Journey 3 (Spec-driven):    X/6 smooth   [v0.4.x — partial]
Journey 4 (Config):         X/5 smooth
Journey 5 (Error):          X/4 smooth
Journey 6 (Power user):     X/5 smooth
---
Total: X/30

Friction points (ranked by frequency x severity):
1. [most impactful friction]
2. ...
3. ...
```

## Phase 2: IDENTIFY

For each friction point, categorize:

| Type | Example | Fix approach |
|------|---------|-------------|
| Dead end | Esc in /agents goes nowhere | Add navigation path |
| Missing feedback | Tool running but no indicator | Add spinner/status |
| Cognitive load | Too many options at once | Progressive disclosure |
| Inconsistency | Esc closes panel A but not B | Standardize behavior |
| Discoverability | Feature exists but hidden | Add contextual hint |
| Error handling | Raw error shown | Add actionable message |
| Speed | Too many steps to reach X | Add shortcut/alias |

## Phase 3: IMPROVE

By type:

### Dead end fix
- Map all navigation paths: from -> action -> to
- Every view must have: Esc = back, clear destination
- No view should trap the user

### Missing feedback fix
- List all async operations
- Each must have: start indicator -> progress -> done/error
- Use shared spinner from status-indicator.ts

### Cognitive load fix
- Count options shown simultaneously
- If > 7 options: group, filter, or paginate
- Show most common first, advanced behind expansion

### Inconsistency fix
- List all Esc behaviors across views
- List all Enter behaviors across views
- Standardize: Esc always = back/cancel, Enter always = confirm/submit

### Discoverability fix
- Add contextual hints (show once per user):
  - After first prompt: "Type /compact when context fills"
  - After first multi-file goal: "edit ./plans/<slug>.md before approving"
  - After 5 sessions: "you have N memory patterns, try /think"
- Track shown hints in config, never repeat

### Error handling fix
- Replace raw errors with: what happened + what to do
- "Connection failed" -> "Can't reach ollama. Start it with
  'ollama serve' or switch provider with /model. [R]etry [S]ettings"
- Never show stack traces in TUI (debug log only)

### Speed fix
- Map keystroke count to reach each feature
- Any feature > 3 keystrokes -> add shortcut or alias
- / commands for most common: /model, /agents, /compact, /sessions

## Phase 4: VALIDATE

For each improvement:
1. Re-walk the affected journey
2. Friction point resolved?
3. No new friction introduced?
4. typecheck + test pass?

If not resolved -> iterate (max 5)
If resolved -> next friction point

## Safety Gates

1. ALWAYS ask user before modifying source code
2. NEVER apply change without running typecheck + tests after
3. NEVER retry same improvement more than 2 times
4. NEVER modify more than 3 files in a single improvement
5. STOP after 5 total iterations per journey
6. NEVER change core business logic to fix UX
7. ALWAYS show the diff before applying
8. ALWAYS re-walk the journey to verify

## Circuit Breaker Conditions (STOP immediately)

- 3 consecutive iterations with no file changes -> stuck
- Same friction point persists after 2 attempts -> approach is wrong
- Test count drops (change broke something) -> revert and stop
- Change touches > 5 files -> too complex, needs human planning

## UX Principles (always apply)

1. Never freeze the UI. Esc always responsive
2. Show what's happening. No mystery waits
3. Error = action. Every error has a next step
4. Context is king. Don't make user re-explain
5. Progressive disclosure. Simple first, depth on demand
6. Keyboard first. Mouse as bonus
7. Consistency. Same key = same behavior everywhere
8. Speed. Under 3 keystrokes to any feature
9. Memory. Remember user preferences across sessions
10. Graceful degradation. Works on 80x24, shines on 120x40
