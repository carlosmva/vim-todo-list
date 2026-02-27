# note-due-dates Specification

## Purpose
TBD - created by archiving change add-due-dates-and-calendar-view. Update Purpose after archive.
## Requirements
### Requirement: Notes can have an optional due date
Each note SHALL support an optional due date. Notes without a due date SHALL behave as they do today (no date displayed).

#### Scenario: New note without due date
- **WHEN** a user creates a new note and skips or leaves the due date empty
- **THEN** the note is created with no due date and displays normally

#### Scenario: New note with due date
- **WHEN** a user creates a new note and selects a due date
- **THEN** the note is created with that due date and the due date is displayed on the card

### Requirement: New note flow prompts for due date
When adding a new note, the system SHALL prompt the user for an optional due date. The user SHALL be able to skip or leave the due date empty.

#### Scenario: Due date prompt on add
- **WHEN** the user submits the create-note form (clicks Add or presses Enter)
- **THEN** the system prompts for a due date before or as part of creating the note (e.g., inline date picker, modal, or second step)

#### Scenario: User can skip due date
- **WHEN** the user is prompted for a due date
- **THEN** the user can proceed without setting a due date (e.g., skip button, optional field, or empty selection)

### Requirement: Due date is displayed on the card front
The note card front SHALL display the due date when the note has one. The due date SHALL appear in a prominent position (e.g., top or front of the card).

#### Scenario: Card shows due date when set
- **WHEN** a note has a due date
- **THEN** the card front displays the due date in a human-readable format (e.g., "Mar 15" or "2025-03-15")

#### Scenario: Card omits due date when not set
- **WHEN** a note has no due date
- **THEN** the card front does not display a due date

### Requirement: Due date is editable on the card
The system SHALL allow the user to edit the due date from the card front. The user SHALL be able to set, change, or clear the due date.

#### Scenario: User can set due date on existing note
- **WHEN** the user activates the due date control on a note card that has no due date
- **THEN** the user can select a date and the note is updated

#### Scenario: User can change due date on existing note
- **WHEN** the user activates the due date control on a note card that has a due date
- **THEN** the user can change the date and the note is updated

#### Scenario: User can clear due date
- **WHEN** the user clears the due date (e.g., via a clear/remove action)
- **THEN** the note's due date is removed and the card no longer displays it

### Requirement: Due date persists across sessions
The system SHALL persist the due date in storage. Due dates SHALL survive popup reloads, board switches, and browser restarts.

#### Scenario: Due date survives reload
- **WHEN** a note has a due date and the user closes and reopens the popup
- **THEN** the note still displays the same due date

