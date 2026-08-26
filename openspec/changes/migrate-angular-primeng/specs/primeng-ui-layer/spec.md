# primeng-ui-layer Specification

## Purpose

Define how the migrated extension UI uses PrimeNG components while preserving existing interaction patterns, themes, keyboard accessibility, and the link-style action control requirements from `popup-text-link-controls`.

## ADDED Requirements

### Requirement: Interactive controls use PrimeNG components

Dialogs, form inputs, selects, tabs, date pickers, menus, toasts, and confirmation flows in the migrated UI SHALL be implemented with PrimeNG components rather than Carbon or ad hoc unstyled controls.

#### Scenario: Settings opens as a PrimeNG dialog or tabbed panel

- **WHEN** the user opens Settings from the header
- **THEN** settings are presented using PrimeNG dialog, sidebar, tabs, or accordion components

#### Scenario: Due date selection uses PrimeNG date picker

- **WHEN** the user sets or edits a due date on a note
- **THEN** a PrimeNG date picker (or equivalent PrimeNG input) is used for date selection

#### Scenario: Board tabs use PrimeNG tabs

- **WHEN** the user views multiple boards
- **THEN** board switching is implemented with PrimeNG tab components

### Requirement: Action controls remain link-style and monospaced

Card and header action controls implemented with PrimeNG SHALL retain link-style appearance (no filled button chrome) and monospaced typography, consistent with `popup-text-link-controls`.

#### Scenario: Card actions look like links

- **WHEN** the user views note card action controls (Priority, Links, Notes, Delete, etc.)
- **THEN** controls appear as link-style text without heavy button backgrounds

#### Scenario: Action controls use button semantics

- **WHEN** an action performs an in-app operation
- **THEN** the control retains keyboard-activatable button semantics (PrimeNG button or native button with appropriate ARIA)

### Requirement: PrimeNG theming supports existing theme ids

The UI SHALL support the same theme identifiers as before (`light`, `dark`, `solarized-light`, `solarized-dark`, `emacs`, `command-line`) by mapping CSS variables or PrimeNG theme presets so PrimeNG surfaces match the active theme.

#### Scenario: User cycles theme

- **WHEN** the user selects a different theme
- **THEN** PrimeNG components restyle to match the selected theme alongside non-PrimeNG surfaces (e.g., overlay backdrop via postMessage)

### Requirement: Keyboard focus and activation work on PrimeNG controls

PrimeNG interactive elements SHALL remain reachable via Tab navigation with visible focus indicators, and Enter/Space (or existing vim bindings where applicable) SHALL activate focused controls without regression.

#### Scenario: Tab through header and card actions

- **WHEN** the user presses Tab repeatedly
- **THEN** focus moves through action controls with a visible focus ring

#### Scenario: Enter activates focused action

- **WHEN** a link-style action control has focus and the user presses Enter
- **THEN** the associated action runs

### Requirement: No Carbon Design dependency in migrated UI

After cutover, the migrated popup SHALL NOT load `vendor/carbon.min.css` or `carbon-components` for rendering the main UI.

#### Scenario: Popup loads without Carbon CSS

- **WHEN** the user opens the migrated popup
- **THEN** the document does not include Carbon stylesheet links required for layout or controls

### Requirement: Functional parity for modals and confirmations

Destructive or irreversible actions (delete note, import DB overwrite, Obsidian conflict resolution) SHALL use PrimeNG confirmation or dialog patterns while preserving the same outcomes as the pre-migration UI.

#### Scenario: Delete note confirmation

- **WHEN** the user deletes a note that requires confirmation
- **THEN** a PrimeNG confirm dialog (or equivalent) appears and cancel/confirm behave as before

#### Scenario: Obsidian conflict modal

- **WHEN** vault and app content conflict ambiguously
- **THEN** a PrimeNG dialog presents side-by-side previews with the same choice outcomes (keep app, keep vault, cancel)
