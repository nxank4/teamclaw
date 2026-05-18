# InteractiveBlock

A generic inline picker that lives in the chat stream. Captures keyboard
focus while mounted, navigates a list with arrow keys, and replaces
itself with a one-line summary on Enter (or removes itself on Esc).

Used by `/themes` today; the abstraction is reusable for future inline
pickers (interview answers, settings choices, agent selection).

## Selection summary convention

After Enter, the multi-line block is replaced in-place with a one-line
summary that stays in chat history. Use the format:

```
→ <noun>: <value>
```

| Rule | Why |
|------|-----|
| Lowercase noun (`theme`, not `Theme`). | Reads more like a status line, less like a button label. |
| No surrounding brackets, no `op:` prefix. | The action is already implied by the picker that closed; the user doesn't need to be told twice. |
| Optional trailing `· <metric>` segments. | For pickers that produce richer summaries (timings, counts). |
| Cancellation does not log. | Esc / Ctrl+C / `/` removes the block without leaving any trace. Silence is the signal. |

### Examples

| Picker | Summary |
|--------|---------|
| `/themes` → pick pawlbon | `→ theme: pawlbon` |
| Model picker → pick claude-opus-4-7 | `→ model: claude-opus-4-7` |
| Interview answer step 3/5 | `→ interview: 3/5 answered` |
| Task completion (via sticky region) | `→ task: Reverting editor infra · 12m 47s · 5 commits` |

## Wiring a new picker

```ts
ctx.mountInteractiveBlock?.<MyItem>({
  items,
  initialIndex,
  tag: "op:mypicker",
  statusHint: "mypicker · ↑↓ Enter Esc",
  render: (i) => renderMyPicker(items, i),
  onSelect: async (item) => { /* persist */ },
  onFormatSelection: (item) =>
    tokens.picker.hint("→ noun: ") + tokens.ui.brandPrimary(item.label),
});
```

`onFormatSelection` is optional. When omitted, the default summary is
`→ selected`, which is useful for tests and for pickers whose value
isn't worth surfacing in chat.
