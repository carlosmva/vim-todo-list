## ADDED Requirements

### Requirement: Popup loads a dedicated modern visual layer
The popup SHALL load a dedicated `modern.css` stylesheet that applies after existing base popup styles so visual overrides are deterministic and isolated.

#### Scenario: Modern stylesheet is applied in override order
- **WHEN** the popup document is loaded
- **THEN** `modern.css` is loaded after `popup.css` and can override base popup presentation without changing popup behavior logic

### Requirement: Modernized cards and tabs preserve existing interactions
The system SHALL present cards and tabs with modernized visual treatment (spacing, hierarchy, surface styling, and interaction states) while preserving existing interaction behavior and control semantics.

#### Scenario: Card and tab visuals are modernized
- **WHEN** the user views notes cards and board tabs
- **THEN** cards and tabs render with updated visual styling for active, hover, and focus states compared to baseline styles

#### Scenario: Existing control behaviors are unchanged
- **WHEN** the user activates existing actions (tabs, note actions, attachments, dashboard/manage/instructions controls)
- **THEN** each action performs the same function as before the visual refresh

### Requirement: Motion is intentional and accessibility-aware
The popup SHALL use lightweight animations for key UI transitions and MUST provide reduced-motion behavior.

#### Scenario: Standard motion mode
- **WHEN** the user interacts with tabs or note cards in a standard motion environment
- **THEN** transitions use short-duration visual motion that improves feedback without delaying interaction

#### Scenario: Reduced motion mode
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** non-essential animations are removed or minimized while preserving usability

### Requirement: Keyboard workflows and widget color codes are preserved
The visual refresh SHALL preserve existing keybindings and MUST preserve current widget color codes used for note priority meaning.

#### Scenario: Keybindings remain unchanged
- **WHEN** the user uses existing keyboard shortcuts and key-driven navigation in the popup
- **THEN** commands and outcomes match pre-refresh behavior

#### Scenario: Priority colors remain unchanged
- **WHEN** notes are rendered with priority values `low`, `normal`, and `high`
- **THEN** note text colors remain `#161616` for low, `#0f62fe` for normal, and `#da1e28` for high
