## Purpose

Let a user compare a linked Obsidian notes folder to the local database after the vault is writable, then import only Markdown files whose Vim To-Do id is missing from SQLite—without duplicating an id that an imported database already contains.

## ADDED Requirements

### Requirement: Compare and import require Sync mode and a writable linked folder

The system SHALL offer vault compare/import only when Sync mode is on and a vault folder handle is available. The compare action SHALL request read/write permission on that handle in the same user gesture as the click, before listing files. If Sync is off, no folder is linked, or permission is not granted, the system SHALL NOT import notes and SHALL show a readable error.

#### Scenario: Compare after vault is linked and Sync is on

- **WHEN** Sync mode is on, a vault folder is linked, the user activates Compare vault, and directory permission is granted
- **THEN** the system SHALL scan the configured notes folder and SHALL present a compare summary

#### Scenario: Compare without a linked folder

- **WHEN** the user activates Compare vault and no vault directory handle is available
- **THEN** the system SHALL show that two-way compare needs a linked folder and SHALL NOT import notes

#### Scenario: Permission denied

- **WHEN** the user activates Compare vault and directory `requestPermission` does not return granted
- **THEN** the system SHALL show that folder access was denied and SHALL NOT import notes

### Requirement: Scan is limited to the configured notes folder board directories

The compare scan SHALL read Markdown files under the configured notes folder’s immediate board directories (`{notesFolder}/{board}/*.md`). The system SHALL NOT walk the vault root or other folders as part of this compare. Files without a Vim To-Do `(id N)` footer SHALL be ignored and counted as ignored, not imported.

#### Scenario: Notes-folder files are compared

- **WHEN** compare runs and `ToDo/Work/task.md` contains footer `(id 42)`
- **THEN** that file SHALL be included in the compare result for id 42

#### Scenario: Vault-root files are not compared

- **WHEN** compare runs and a Markdown file exists at the vault root or outside the configured notes folder
- **THEN** that file SHALL NOT be imported and SHALL NOT appear as a missing note

#### Scenario: File without footer is ignored

- **WHEN** compare finds a Markdown file under the notes folder with no `(id N)` footer
- **THEN** the system SHALL NOT create a database note for that file and SHALL include it in the ignored count

### Requirement: Existing database ids are never duplicated

When a scanned file’s footer id already exists as a SQLite note, the system SHALL NOT insert another note with that id or a new id. The system SHALL remember the canonical vault path for that id so later Open/Sync uses the same file. If several files share the same id, the system SHALL prefer a non-numbered filename over an Obsidian numbered copy.

#### Scenario: Imported database already has the vault id

- **WHEN** the database contains note id 7 and the vault has a notes-folder file with footer `(id 7)`
- **THEN** compare SHALL classify that id as already present and import SHALL NOT insert a second note

#### Scenario: Numbered duplicate is not imported as a second card

- **WHEN** both `Title.md` and `Title 1.md` contain footer `(id 7)` and the database has no note 7
- **THEN** import SHALL create exactly one note with id 7 from the non-numbered file and SHALL remember that path

### Requirement: Missing footer ids are imported with the same id

When the user confirms import, each vault-only footer id SHALL become one SQLite note whose id equals that footer id. The system SHALL restore title, notes body, board, status, and due date from the Markdown when those fields are present. If the footer board does not exist, the system SHALL create that board. Import SHALL NOT rewrite vault files.

#### Scenario: Vault-only id becomes that same card

- **WHEN** the vault has a notes-folder file with footer `(id 42)` and the database has no note 42, and the user confirms import
- **THEN** the database SHALL contain exactly one note with id 42 whose title and body match the file

#### Scenario: Footer board is created if missing

- **WHEN** the imported file footer names board `Archive` and that board does not exist
- **THEN** after import the system SHALL have an `Archive` board containing note 42

#### Scenario: Vault file is not rewritten

- **WHEN** import creates or skips notes
- **THEN** the scanned Markdown files SHALL remain unchanged on disk

### Requirement: User confirms before any import writes

Compare SHALL NOT insert notes. After compare, the system SHALL show counts of missing ids (to import), already-present ids (and how many of those differ in Markdown), and ignored files. Import SHALL run only after the user confirms. Cancel or dismiss SHALL leave the database unchanged.

#### Scenario: Compare is read-only until confirm

- **WHEN** compare finishes with four missing ids
- **THEN** the database SHALL still have no new notes until the user confirms import

#### Scenario: Cancel leaves the database unchanged

- **WHEN** the user dismisses the compare summary without confirming
- **THEN** the system SHALL NOT insert notes

### Requirement: Content differences for existing ids are reported, not bulk-resolved

When an already-present id has normalized Markdown that differs from the database note, the compare summary SHALL count that difference. The system SHALL NOT present the per-note conflict UI as part of compare/import. Later Open or Notes sync for that card remains responsible for keep-card / keep-vault / cancel.

#### Scenario: Differing existing id is counted only

- **WHEN** note 7 exists in the database and the vault file for `(id 7)` has different normalized Markdown
- **THEN** the summary SHALL report that at least one already-present id differs and SHALL NOT open the conflict modal

### Requirement: URI-only mode does not import from disk

When Sync is off or no directory handle is available, the system SHALL NOT scan or import vault files (there is no readable vault folder).

#### Scenario: Sync off

- **WHEN** Sync mode is off and the user has no granted folder, or Compare vault is unavailable
- **THEN** the system SHALL NOT create notes from vault Markdown
