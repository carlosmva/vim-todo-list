## 1. Styling Foundation

- [x] 1.1 Add `modern.css` to the extension and include it in `popup.html` after `popup.css`.
- [x] 1.2 Define theme tokens in `modern.css` (surfaces, borders, typography, spacing, motion) scoped to popup UI selectors.
- [x] 1.3 Ensure existing priority color selectors remain unchanged (`low` `#161616`, `normal` `#0f62fe`, `high` `#da1e28`).

## 2. Modernize Core UI Surfaces

- [x] 2.1 Restyle header, create form, and utility action rows to improve hierarchy and spacing while preserving existing control semantics.
- [x] 2.2 Modernize board tabs (inactive/active/hover/focus states) without changing tab switching behavior.
- [x] 2.3 Modernize note card surfaces (front/back, attachments area, editor shell, buttons row) without changing JS-driven interactions.

## 3. Motion and Accessibility

- [x] 3.1 Add lightweight transitions for tab activation, card hover/flip-adjacent states, and view transitions using short durations.
- [x] 3.2 Implement `prefers-reduced-motion: reduce` rules to disable/minimize non-essential animations.
- [x] 3.3 Verify focus indicators remain visible and high-contrast across modernized controls.

## 4. Behavior and Regression Validation

- [x] 4.1 Validate existing keybindings and keyboard navigation flows still produce identical behavior.
- [x] 4.2 Validate existing actions (note lifecycle, attachments, dashboard/instructions/manage tabs, import/export) are unchanged.
- [x] 4.3 Perform visual regression checks at popup dimensions (`720x600`) and confirm no clipping/overflow regressions in main views.

## 5. Finalize and Document

- [x] 5.1 Remove or adjust conflicting legacy style rules only where needed to avoid duplicate/competing declarations.
- [x] 5.2 Document the new style-layer approach and rollback step (remove `modern.css` include) in change notes.
- [x] 5.3 Run project validation commands and capture results for the change handoff.

