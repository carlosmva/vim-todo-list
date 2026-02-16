## Requirements

### Requirement: Popup uses monospaced link-style action controls
The popup UI SHALL render all action controls as link-style elements using a monospaced font.

This requirement applies to:
- Controls rendered in static markup (e.g., export/import/add/close actions)
- Controls rendered dynamically in note cards and other JS-built UI

#### Scenario: Action control appearance is link-like
- **WHEN** the user views the popup UI
- **THEN** action controls are presented without button chrome (no filled backgrounds or heavy borders)

#### Scenario: Action control typography is monospaced
- **WHEN** the user views any action control
- **THEN** the action control text uses a monospaced font (with a reasonable fallback stack)

### Requirement: Action controls preserve behavior and semantics
The system SHALL preserve existing behaviors for all action controls after restyling them as link-style controls.

#### Scenario: Clicking an action triggers the same behavior
- **WHEN** the user activates an action control
- **THEN** the same action occurs as before the change (no functional regressions)

#### Scenario: Non-navigation actions remain buttons semantically
- **WHEN** an action control triggers an in-app operation (not navigation)
- **THEN** the control is implemented with button semantics (e.g., a native button element) so it is keyboard-activatable and correctly announced by assistive technology

### Requirement: Action controls are keyboard accessible
The system SHALL ensure action controls are usable via keyboard navigation.

#### Scenario: Focus is visible when tabbing
- **WHEN** the user presses Tab to move focus across action controls
- **THEN** the focused control shows a clearly visible focus indicator

#### Scenario: Keyboard activation works
- **WHEN** the user presses Enter on a focused action control
- **THEN** the system activates the action

### Requirement: Action controls show interaction states
The system SHALL provide clear interaction feedback for action controls.

#### Scenario: Hover state is visible
- **WHEN** the pointer hovers over an enabled action control
- **THEN** the control shows a visible hover state (e.g., underline or other link-like affordance)

#### Scenario: Disabled controls are non-interactive
- **WHEN** an action is not available
- **THEN** the associated control is disabled, cannot be activated, and does not show hover styling
