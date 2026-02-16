## ADDED Requirements

### Requirement: Notes have a priority value
Each note SHALL have a priority value of `low`, `normal`, or `high`.

#### Scenario: Existing notes default to normal
- **WHEN** a user opens the popup with notes created before prioritization existed
- **THEN** each existing note is treated as `normal` priority

#### Scenario: New notes start as normal
- **WHEN** a user creates a new note
- **THEN** the new note priority is `normal`

### Requirement: Priority can be changed from the note card actions row
The popup UI SHALL provide a priority control for each note on the same actions row as Attachments / Notes / Delete.

#### Scenario: Priority control is present on each card
- **WHEN** the user views a note card
- **THEN** the note card includes a priority control in the actions row

#### Scenario: Changing priority updates the note
- **WHEN** the user activates the priority control on a note card
- **THEN** the note priority changes to the next available value (low/normal/high)

### Requirement: Priority affects note text styling
The popup UI SHALL visually indicate priority by color-coding the note text based on its priority.

#### Scenario: High priority is visually emphasized
- **WHEN** a note is `high` priority
- **THEN** the note text is rendered with a visually emphasized color compared to `normal`

#### Scenario: Low priority is visually de-emphasized
- **WHEN** a note is `low` priority
- **THEN** the note text is rendered with a visually de-emphasized color compared to `normal`

### Requirement: Cards are ordered by priority
The system SHALL order cards by priority.

#### Scenario: Higher priority appears first
- **WHEN** the user views a list of note cards
- **THEN** `high` priority notes appear before `normal`, and `normal` appear before `low`

### Requirement: Priority control is keyboard accessible
The system SHALL ensure the per-card priority control is keyboard accessible.

#### Scenario: Focus is visible on the priority control
- **WHEN** the user navigates to the priority control via keyboard navigation
- **THEN** the focused priority control shows a visible focus indicator

#### Scenario: Keyboard activation changes priority
- **WHEN** the priority control is focused and the user presses Enter
- **THEN** the note priority changes
