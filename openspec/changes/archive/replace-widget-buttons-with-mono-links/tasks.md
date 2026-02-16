## 1. Inventory and CSS foundation

- [x] 1.1 Inventory all action controls in `popup.html` and JS-generated UI (`popup.js`) that currently use `.bx--btn` or `<button>`
- [x] 1.2 Define a single link-style action control class (e.g., `monoLinkButton`) in `popup.css`
- [x] 1.3 Add a robust monospaced font stack for action controls (prefer existing shipped fonts; fall back to system monospace)
- [x] 1.4 Implement link-like interaction states for action controls (hover/active)
- [x] 1.5 Implement a clear `:focus-visible` style for keyboard users
- [x] 1.6 Style disabled action controls (`:disabled`) to be visibly disabled and non-hoverable

## 2. Update static popup markup

- [x] 2.1 Update create-form actions in `popup.html` (Export DB / Import DB / Export CSV / Add) to use the new link-style class while keeping native button semantics
- [x] 2.2 Update view close actions in `popup.html` (Close buttons in Instructions/Manage Tabs) to use the new link-style class
- [x] 2.3 Update Manage Tabs "Add" submit button to use the new link-style class

## 3. Update dynamic note-card and list controls

- [x] 3.1 Update all `document.createElement("button")` action controls in `popup.js` to apply the new link-style class (while preserving existing `type`, `disabled`, and `data-action` attributes)
- [x] 3.2 Ensure any dynamic action controls that previously depended on `.bx--btn` classes still look correct (remove heavy button chrome)
- [ ] 3.3 Verify the note-card actions row still fits and remains usable after restyling (no layout regressions)

## 4. Behavior and accessibility verification

- [ ] 4.1 Verify all actions still perform the same operations (export/import/add/close/delete/move/flip/etc.)
- [ ] 4.2 Verify keyboard navigation and activation across action controls (Tab order, Enter activation)
- [ ] 4.3 Verify in-card focus movement logic still works (any code that traverses `button` elements continues to function)
- [ ] 4.4 Verify focus visibility meets the spec (focus indicator is clearly visible across all views)
- [ ] 4.5 Verify disabled actions cannot be activated and are not focusable (native `disabled` behavior preserved)
