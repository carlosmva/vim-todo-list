# obsidian-vault-sync Specification

## Purpose

Define how the extension keeps notes and Obsidian vault Markdown files consistent when the user configures a vault name, optional notes subfolder, Sync mode, and a linked vault directory via the File System Access API—without relying on unsafe or duplicate-prone URI patterns for ongoing updates.

## ADDED Requirements

### Requirement: Vault filesystem sync is used when Sync mode and a linked folder handle are available

When Sync mode is enabled AND the extension has a granted directory handle for the vault root, the system SHALL read and write note Markdown via the File System Access API to paths derived from board slug, note title, and note id as implemented. The system SHALL NOT rely on `obsidian://` URLs alone to push updated Markdown content for those paths.

#### Scenario: User opens Obsidian after editing with sync available

- **WHEN** Sync mode is on, the vault folder is linked, and the user opens or saves note content then activates “Obsidian” for that note  
- **THEN** the system SHALL persist the latest note data from SQLite to the vault Markdown file before or as part of that flow, so the file on disk reflects the app’s canonical Markdown for that note

### Requirement: In-memory note editor content is flushed to SQLite before vault merge

Before comparing or merging vault file content with app content for a note, the system SHALL persist any pending rich-text editor draft for that note id to the database so merge logic uses up-to-date `notes_html` and timestamps.

#### Scenario: User clicks Obsidian immediately after typing in the notes editor

- **WHEN** the notes editor for that card has unsaved debounced changes  
- **THEN** those changes SHALL be written to SQLite (and vault push if applicable) before vault read/compare for that note is performed

### Requirement: Deterministic merge uses normalized Markdown and timestamp slack

The system SHALL compare normalized Markdown (consistent line endings and trailing whitespace handling) when deciding if app and vault files match. When comparing file modification time to the note’s `updated_at`, the system SHALL treat the vault as strictly newer than the app only if the file time exceeds the app’s `updated_at` by more than a small, fixed slack window (on the order of hundreds of milliseconds) unless the requirement explicitly uses an unambiguous rule (e.g. normalized content differs).

#### Scenario: Vault file is insignificantly newer than app timestamp

- **WHEN** normalized Markdown differs OR the vault is not clearly newer per the slack rule  
- **THEN** the system SHALL NOT automatically overwrite the app with the vault solely because file mtime is a few milliseconds ahead of `updated_at`

### Requirement: Ambiguous merge presents an explicit choice

When normalized Markdown differs and neither side is clearly newer per the merge rules, the system SHALL prompt the user to choose whether to keep the app version or the vault version (or cancel), rather than silently picking a side.

#### Scenario: Timestamps tie and content differs

- **WHEN** normalized Markdown differs and timestamps are within the ambiguous band  
- **THEN** the system SHALL show a conflict resolution affordance before applying one side’s content to the other

### Requirement: Opening Obsidian does not navigate only via the extension frame for obsidian:// URLs

When launching an `obsidian://` URL in response to a user action, the system SHALL prefer opening the URL in a way that does not require assigning the extension’s own document to the custom scheme as the sole mechanism (e.g. creating a new tab via the extension tabs API when available, then falling back to a new-window or anchor navigation). The implementation SHALL provide a fallback chain if the primary mechanism fails.

#### Scenario: Extension runs inside a host with a restrictive frame-src CSP

- **WHEN** the user triggers Open in Obsidian  
- **THEN** the `obsidian://` URL SHALL still be delivered to the OS/browser protocol handler without relying on frame navigation that the host’s CSP blocks

### Requirement: obsidian:// URI pattern avoids duplicate note files for the same logical path

For a given vault name, note id, and resolved relative file path, the first successful creation MAY use `obsidian://new` with file and content as needed. After the system has recorded that the path has been created for that note (first-open tracking), subsequent launches for that path SHALL use `obsidian://open` only and SHALL NOT use `obsidian://new` with embedded content to “refresh” an existing file, because that can create numbered duplicate files in Obsidian.

#### Scenario: Second and later opens for an existing mapped path

- **WHEN** first-open tracking indicates the path was already created  
- **THEN** the system SHALL use `open` (not `new` with body content) for that path

### Requirement: Final vault file write before opening Obsidian when using filesystem sync

When Sync mode and a linked handle are active and the flow opens Obsidian for a note, the system SHALL re-read the note from SQLite, write the built Markdown to the resolved vault file path, align persistence as designed, and then open the Obsidian URL so on-disk content matches the database state before the external app is invoked.

#### Scenario: User expects Obsidian to show the latest extension edits

- **WHEN** the user clicks “Obsidian” with vault sync active  
- **THEN** the vault file SHALL be updated from the current database row for that note before `obsidian://open` is invoked

### Requirement: First-open cache can be reset by the user

The system SHALL provide a control (e.g. in Settings) that clears stored “path already created” (first-open) state so the next operation can use create semantics again if recovery is needed after a failed create or manual file deletion.

#### Scenario: User clears the cache after deleting the file in Obsidian

- **WHEN** the user invokes the reset-first-open action  
- **THEN** the stored first-open keys for Obsidian paths SHALL be cleared so the next Obsidian action can recreate as appropriate
