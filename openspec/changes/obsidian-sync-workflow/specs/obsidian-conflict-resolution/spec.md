# obsidian-conflict-resolution Specification

## Purpose

Define conflict UX when extension card Markdown and the canonical vault file disagree: the user MUST see a readable line-level diff and MUST choose keep-card, keep-vault, or cancel. The system SHALL NOT overwrite either side silently.

## ADDED Requirements

### Requirement: Differing Markdown always presents an explicit choice

When Sync mode and a linked folder are available and normalized card Markdown differs from the canonical vault file’s Markdown, the system SHALL show the conflict resolution UI before applying either side. The system SHALL NOT import the vault over the card or export the card over the vault solely because one timestamp is newer.

#### Scenario: Content differs regardless of timestamps

- **WHEN** normalized Markdown differs between the card and the canonical vault file
- **THEN** the system SHALL show the conflict UI and SHALL NOT write either side until the user chooses keep-card or keep-vault

#### Scenario: Equal Markdown does not open the conflict UI

- **WHEN** normalized Markdown matches between the card and the canonical vault file
- **THEN** the system SHALL NOT show the conflict UI and MAY align the card’s `updated_at` with the file modification time

### Requirement: Conflict UI shows a readable side-by-side line diff

The conflict UI SHALL display two labeled previews: the extension card Markdown and the vault file Markdown. Each preview SHALL show a line-level diff (added, removed, and unchanged lines distinguishable). Diff chrome SHALL be styled by the Angular application so the previews are readable (not an unstyled or empty panel). The modal SHALL be hosted at the application root so it is not clipped by card overflow.

#### Scenario: User can see what changed

- **WHEN** the conflict UI opens because Markdown differs
- **THEN** both columns SHALL show the Markdown with visible diff markers or highlighting for changed lines

#### Scenario: Large notes still show a preview

- **WHEN** the Markdown is too large for a full computed diff
- **THEN** the UI SHALL still show a readable plain preview of both sides and SHALL explain that the full diff was skipped

### Requirement: User can keep the card, keep the vault, or cancel

The conflict UI SHALL offer keep-card, keep-vault, and cancel. Keep-card SHALL write the card’s Markdown to the canonical vault path and leave the SQLite note unchanged except for timestamps required by the write. Keep-vault SHALL import the vault Markdown into the SQLite note (title and notes body as parsed) and SHALL NOT overwrite the vault file. Cancel SHALL close the UI without writing the vault file and without changing the SQLite note.

#### Scenario: Keep this card

- **WHEN** the user chooses keep-card
- **THEN** the canonical vault file SHALL contain the card’s Markdown and the card content SHALL remain as it was

#### Scenario: Keep vault file

- **WHEN** the user chooses keep-vault
- **THEN** the SQLite note SHALL match the imported vault title and body and the vault file SHALL be unchanged by that choice

#### Scenario: Cancel leaves both sides unchanged

- **WHEN** the user cancels or dismisses the conflict UI
- **THEN** the system SHALL NOT write the vault file and SHALL NOT update the SQLite note from the vault

### Requirement: Conflict UI is usable from keyboard

While the conflict UI is open, the system SHALL let the user choose keep-card with `1`, keep-vault with `2`, and dismiss with Escape, and SHALL move focus among the choice buttons with arrow keys.

#### Scenario: Digit keys apply a choice

- **WHEN** the conflict UI is open and the user presses `1`
- **THEN** the system SHALL apply keep-card

#### Scenario: Escape cancels

- **WHEN** the conflict UI is open and the user presses Escape
- **THEN** the system SHALL dismiss the UI without applying either side

### Requirement: After a choice the original user action continues

When the conflict was presented because the user opened the Notes editor, keep-card or keep-vault SHALL then open the editor with the resulting note content. When the conflict was presented because the user activated Obsidian, keep-card or keep-vault SHALL then open the canonical file in Obsidian with `obsidian://open`. Cancel SHALL NOT open the editor or Obsidian as part of that flow.

#### Scenario: Conflict from Obsidian then keep-card opens Obsidian

- **WHEN** the user activated Obsidian, the conflict UI appeared, and the user chooses keep-card
- **THEN** the system SHALL write the card Markdown to the canonical file and SHALL open that file with `obsidian://open`

#### Scenario: Conflict from Notes then keep-vault opens the editor

- **WHEN** the user opened Notes, the conflict UI appeared, and the user chooses keep-vault
- **THEN** the system SHALL import the vault into the note and SHALL open the notes editor for that card

### Requirement: URI-only mode does not claim a vault diff

When no linked folder handle is available, the system SHALL NOT show the conflict UI (there is no vault file content to compare).

#### Scenario: URI-only Obsidian click

- **WHEN** the user activates Obsidian with no directory handle
- **THEN** the system SHALL NOT present the conflict UI
