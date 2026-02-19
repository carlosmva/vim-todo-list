## Why

The popup UI is functional but visually dated, which reduces scanability and makes cards/tabs feel dense during daily use. A focused styling refresh is needed now to improve clarity and perceived quality without changing existing keyboard workflows or priority color semantics.

## What Changes

- Add a new `modern.css` stylesheet for the popup to provide a modern visual layer across cards, tabs, spacing, typography, and motion.
- Update popup markup and style loading order as needed so `modern.css` can override baseline styles safely.
- Introduce improved card and tab presentation patterns (e.g., stronger hierarchy, cleaner spacing, and clearer active/hover/focus states).
- Add lightweight, purposeful animations for state changes (tab switching, card interactions, and view transitions) while keeping interaction latency low.
- Preserve current keybindings and interaction behavior implemented in `popup.js` (no command or shortcut remapping).
- Preserve existing widget color codes, especially note priority colors, so visual meaning remains consistent.

## Capabilities

### New Capabilities
- `modern-popup-ui`: Defines requirements for a modern popup visual system (cards, tabs, styles, and animations) that preserves existing keyboard behavior and established color-code semantics.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `popup.html` (stylesheet inclusion and possible structural hooks/classes)
  - `popup.css` (alignment/compatibility with the new visual layer)
  - `popup.js` (only if class hooks are needed; behavior remains unchanged)
  - `modern.css` (new file)
- APIs/data: No storage schema or API changes expected.
- Dependencies: No new runtime dependency required unless a motion utility is explicitly introduced.
- Risk areas: Visual regressions, motion accessibility, and accidental changes to focus visibility or keyboard flows.
