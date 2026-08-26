# compact-json-persistence Specification

## Purpose

Define a compact JSON persistence format for `chrome.storage.local` that reduces storage size and parse cost while preserving SQLite data fidelity, automatic migration from legacy keys, and unchanged Export DB / Import DB user workflows.

## ADDED Requirements

### Requirement: Extension state is stored in a compact JSON envelope

The system SHALL persist extension preferences and the SQLite database reference inside a single JSON envelope stored under a versioned key (e.g. `vtd_v2`), using short field names and serialization without insignificant whitespace.

#### Scenario: Envelope uses short keys

- **WHEN** the system saves theme, active board, keyboard layout, or AI settings
- **THEN** those values are written inside the envelope using documented short keys rather than separate verbose top-level keys

#### Scenario: Serialized JSON is minified

- **WHEN** the envelope is written to `chrome.storage.local`
- **THEN** the stored string contains no pretty-print indentation or unnecessary whitespace

### Requirement: SQLite blob remains the canonical note store inside the envelope

The envelope SHALL contain the sql.js database export encoded as Base64 (or equivalent lossless encoding) so note data, boards, priorities, due dates, and settings stored in SQLite remain authoritative.

#### Scenario: Notes persist across sessions via envelope

- **WHEN** the user creates or edits notes and closes the popup
- **THEN** reopening loads the same SQLite data from the envelope

#### Scenario: Theme stored in SQLite still travels with DB export

- **WHEN** the user exports the database file
- **THEN** the downloaded SQLite file includes settings stored in the database independent of envelope short keys

### Requirement: Legacy storage keys migrate automatically on upgrade

On first load after migration, if legacy keys exist (e.g. `sqliteDb_v1`, `theme_v1`, `activeBoard_v1`, `keyLayout_v1`, AI keys), the system SHALL read them, construct the compact envelope, persist it, and SHALL NOT lose user data.

#### Scenario: Existing user upgrades extension

- **WHEN** a user with data under `sqliteDb_v1` opens the migrated extension for the first time
- **THEN** all notes and preferences appear unchanged after migration completes

#### Scenario: Migration is idempotent

- **WHEN** migration runs more than once
- **THEN** the envelope remains valid and data is not duplicated or cleared

### Requirement: Export DB and Import DB behavior is unchanged

Export DB SHALL produce a binary SQLite file identical in capability to the pre-migration export. Import DB SHALL replace the in-memory database and persist through the compact envelope without requiring users to adopt a new import format.

#### Scenario: Export DB downloads SQLite file

- **WHEN** the user clicks Export DB in Settings
- **THEN** a `.sqlite` (or equivalent) file downloads containing the full database

#### Scenario: Import DB restores data

- **WHEN** the user imports a previously exported DB file
- **THEN** the UI reflects imported boards and notes and the envelope is updated with the new blob

### Requirement: Storage writes are debounced for performance

The system SHALL debounce envelope writes triggered by rapid edits (e.g. typing in notes editor, reordering cards) to avoid excessive `chrome.storage.local` churn while ensuring data is flushed before popup close where feasible.

#### Scenario: Rapid edits coalesce writes

- **WHEN** the user makes many edits within a short interval
- **THEN** storage writes are batched/debounced rather than firing on every keystroke

#### Scenario: Data flushes on close

- **WHEN** the user closes the popup after editing
- **THEN** pending debounced writes are flushed so data survives the next open

### Requirement: CSV export remains available

CSV export SHALL continue to read from SQLite and produce human-readable output (dates formatted, notes HTML as readable text) without requiring users to parse the compact envelope directly.

#### Scenario: Export CSV from settings

- **WHEN** the user exports CSV
- **THEN** a CSV file downloads with the same logical columns and formatting rules as before migration
