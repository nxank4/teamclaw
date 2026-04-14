# Scrollable Select Lists in TUI

## Problem

Select lists (provider select, model select) can have 20+ items. Without scroll, the list overflows the panel or gets clipped.

## Solution

Enhance `InteractiveView` base class with scroll state management. All subclasses get scrolling automatically with minimal render changes.

## Design

### New State in `InteractiveView`

```typescript
protected scrollOffset = 0;   // index of first visible item
protected maxVisible = 10;    // max items shown at once (subclass-configurable)
```

### Modified Arrow Key Handling

- Up/down update `scrollOffset` to keep `selectedIndex` in the visible window
- Wrap-around: down at last item -> first item (scroll to top), up at first -> last (scroll to bottom)
- Filter changes reset both `selectedIndex` and `scrollOffset` to 0

### New Protected Helpers

```typescript
// Returns visible window bounds and hidden item counts
protected getVisibleRange(): { start: number; end: number; aboveCount: number; belowCount: number }

// Wraps item lines with scroll indicators when items are hidden
protected addScrollIndicators(lines: string[], aboveCount: number, belowCount: number): string[]
```

### Scroll Indicators

- `▲ N more` at top when items hidden above (dimmed)
- `▼ N more` at bottom when items hidden below (dimmed)
- Hidden when count is 0
- Not shown when total items <= maxVisible

### Subclass Changes

Each view's `renderLines()` changes:
1. Call `getVisibleRange()` to get the window
2. Slice filtered items with `start..end`  
3. Wrap item lines with `addScrollIndicators()`

### Views Affected

- `SetupWizardView` — provider list + model list steps
- `ModelView` — model picker
- `ModeView` — if applicable (likely short list, no-op)

### Edge Cases

- 0 items: "No items" message, no scroll
- 1 item: show it, no indicators
- Filter reduces below maxVisible: hide indicators, reset offset
- Filter clears: restore full list with scroll
- Wrap-around at both ends

### Files Modified

- `src/app/interactive/base-view.ts` — scroll state + helpers
- `src/app/interactive/setup-wizard-view.ts` — use scroll in provider/model render
- `src/app/interactive/model-view.ts` — use scroll in model render
