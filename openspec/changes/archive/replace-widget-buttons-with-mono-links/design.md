## Context

The extension popup ("Notes Kanban") UI uses Carbon styles (`vendor/carbon.min.css`) and currently renders many actions as Carbon buttons (`.bx--btn` variants) in both static HTML (`popup.html`) and dynamic note card UI built in `popup.js`.

The proposal calls for replacing all widget/popup buttons with monospaced text links that look polished while preserving existing behaviors and keeping keyboard + screen reader accessibility intact.

Constraints / current state:
- The popup already uses link-style navigation in the header (`Manage Tabs`, `Instructions`).
- Many actions are semantically *actions* (export/import/add/close/delete/move/etc.) rather than navigation.
- Some keyboard behavior is explicitly implemented around button focus within note cards (e.g., moving focus across card buttons), so changing element types affects logic.

## Goals / Non-Goals

**Goals:**
- Replace button-style visuals across the popup/widget with a monospaced “text link” control style.
- Preserve the existing interaction model:
  - same click behaviors
  - same enabled/disabled rules
  - same keyboard shortcuts and focus behavior where present
- Maintain or improve accessibility:
  - correct semantics for actions
  - visible focus indication
  - consistent hover/active feedback

**Non-Goals:**
- Changing note storage, SQLite schema, or export/import formats.
- Reworking layout, information architecture, or adding new features.
- Introducing new third-party UI frameworks or fonts beyond what’s already shipped.

## Decisions

1) Keep semantic `<button>` elements for actions; style them as monospaced text links.
- **Why:** These controls trigger actions (not navigation). `<button>` provides correct default semantics and keyboard activation behavior without needing ARIA role workarounds.
- **Alternative considered:** Convert action controls to `<a href="#">` links.
  - **Rejected because:** This complicates semantics (requires `role="button"`, key handling for Space, and careful prevention of navigation), and risks regressions in existing focus/keyboard code that expects real buttons.

2) Introduce a single link-style button class and apply it consistently.
- Approach:
  - Add a CSS class (e.g., `monoLinkButton`) that:
    - removes button chrome (background/border)
    - uses a monospaced font (prefer existing Carbon/Red Hat mono if available; otherwise fall back to system monospace)
    - uses underline/decoration and subtle state changes for hover/active
    - has a clear `:focus-visible` indicator
  - Apply this class to:
    - static controls in `popup.html` (export/import/add/close/manage tabs add)
    - dynamically created buttons in `popup.js` (note card action buttons, link management buttons, etc.)

3) Preserve disabled behavior by using native `disabled` and a disabled visual state.
- **Why:** Native `disabled` on buttons prevents focus/activation, and existing code already filters out disabled buttons in focus movement logic.
- CSS should style `button.monoLinkButton:disabled` to look disabled and remove hover effects.

4) Minimize JS changes by not changing element types.
- Most JS event wiring can remain intact because it already targets IDs or button elements.
- Any places that query/select `.bx--btn` for styling will be updated to include the new class; any logic that queries `button[...]` remains valid.

## Risks / Trade-offs

- [Changing too many controls at once] → Mitigation: inventory all controls (static + JS-created) and update in one pass; validate visually in popup.
- [Loss of Carbon button affordance (discoverability)] → Mitigation: ensure strong hover and focus styles; keep consistent spacing and alignment.
- [Keyboard navigation regressions in note cards] → Mitigation: keep using `<button>` so existing focus movement and activation logic continues to work.
- [Font availability / inconsistency] → Mitigation: use a robust font stack; prefer existing shipped fonts where possible.

