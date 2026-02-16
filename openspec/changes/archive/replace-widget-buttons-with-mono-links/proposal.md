## Why

The popup/widget UI currently relies on button-style controls that feel visually heavy and inconsistent with a “compact notes” workflow. Replacing them with monospaced text links will make the UI feel cleaner, faster to scan, and more cohesive without changing core functionality.

## What Changes

- Replace all button-style controls in the widget/popup UI with text-link controls.
- Use a monospaced font for these links and ensure they look polished (“awesome”) while staying consistent with existing vendor fonts/CSS.
- Preserve all existing behaviors (same actions, shortcuts if any, same enabled/disabled rules).
- Ensure accessible interaction states for mouse + keyboard:
  - clear hover/active styling
  - visible focus ring for tab navigation
  - appropriate semantics (button vs link) so screen readers announce correctly

## Capabilities

### New Capabilities

- `popup-text-link-controls`: The popup/widget control surface uses monospaced text links (not buttons) with consistent interaction states and accessibility behavior.

### Modified Capabilities

- (none)

## Impact

- UI: `popup.html` markup for controls and `popup.css` styling for link-like controls.
- JS: `popup.js` event wiring may need small updates if element types/attributes change (e.g., `<button>` → `<a>` or role-based elements).
- Accessibility: verify keyboard navigation and focus visibility; confirm correct ARIA/semantics for actions.
- No expected changes to storage, note data model, or SQL/wasm integration.
