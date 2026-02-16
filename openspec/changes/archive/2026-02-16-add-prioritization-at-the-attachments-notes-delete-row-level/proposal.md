## Why

Important notes are getting buried in the board, making it easy to miss time-sensitive or high-impact work. A lightweight per-card priority control makes triage faster and keeps the most important items visible without requiring manual reordering.

## What Changes

- Add a per-card prioritization toggle with three values: **low**, **normal**, **high**.
- Place the prioritization toggle on the same action row as the card’s **Attachments / Notes / Delete** controls.
- Default all newly created notes to **normal** priority.
- Color-code the note’s text (or the card’s primary text area) based on its priority.
- Order cards by priority consistently (priority is always applied to ordering).

## Capabilities

### New Capabilities
- `note-prioritization`: Per-note priority (low/normal/high) with a UI toggle on each card, defaulting to normal, and affecting both visual styling and card ordering.

### Modified Capabilities
- (none)

## Impact

- **UI / UX**: note cards gain a new action-row control and priority-based text styling.
- **Data model**: notes must persist a priority value; existing notes need a reasonable default (normal).
- **Sorting / ordering**: note queries and rendering order must incorporate priority ordering.
- **Keyboard accessibility**: the new toggle must be keyboard-focusable/activatable and work with existing navigation patterns.
- **Import/Export**: if the extension exports/imports notes, priority may need to round-trip to avoid losing user intent.
