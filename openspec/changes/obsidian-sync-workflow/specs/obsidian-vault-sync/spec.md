# obsidian-vault-sync Specification

## Purpose

Define a reliable workflow for mapping each extension card to exactly one Obsidian vault Markdown file when Sync mode and a linked folder are configured—without creating numbered duplicates, swallowing filesystem errors, or using `obsidian://new` as a recovery path.

## ADDED Requirements

### Requirement: Filesystem sync is used when Sync mode and a linked folder are available

When Sync mode is enabled and the extension has a granted directory handle for the vault, the system SHALL read and write that note’s Markdown via the File System Access API. The system SHALL NOT use `obsidian://new` (with or without content) to push updates for a note that already has a mapped file.

#### Scenario: Open Obsidian writes the mapped file then opens it

- **WHEN** Sync mode is on, the vault folder is linked with permission granted, and the user activates Obsidian for a note whose canonical file already exists
- **THEN** the system SHALL write the chosen Markdown to that same file path and SHALL open Obsidian with `obsidian://open` for that path

#### Scenario: First create uses a filesystem write then open

- **WHEN** Sync mode is on, the vault folder is linked with permission granted, and no canonical file exists for that note
- **THEN** the system SHALL create exactly one Markdown file at the computed path, remember that path, and SHALL open it with `obsidian://open` only

### Requirement: Each card maps to exactly one vault file

When Sync mode and a linked folder are available, the system SHALL treat one canonical Markdown file as the vault counterpart for a note. Identity SHALL use the remembered path for that note, then a file whose exported Markdown includes that note’s id footer `(id N)`. The system SHALL NOT write a second file for the same note because a title slug, scan, or write failed.

#### Scenario: Second Obsidian open does not create a numbered copy

- **WHEN** the user activates Obsidian for a note that already has a canonical vault file
- **THEN** the vault SHALL still contain a single file for that note id (no new `Name 1` / `Name 2` file created by the extension)

#### Scenario: Failed scan does not create a new file

- **WHEN** locating the canonical file fails because permission was denied, the folder handle is missing, or a read error occurred
- **THEN** the system SHALL NOT create a new Markdown file via filesystem write or `obsidian://new`

### Requirement: Canonical file lookup uses remembered path then board folder

The system SHALL resolve the canonical file in this order: remembered relative path for that vault and note id; then the computed board/title path; then a scan of the configured notes folder’s board directory for Markdown whose footer is `(id N)`. The system SHALL NOT walk the entire vault root as the primary lookup. When multiple files match the same note id, the system SHALL prefer a non-numbered filename over Obsidian numbered copies and SHALL remember the chosen path.

#### Scenario: Title change still finds the existing file

- **WHEN** the user changes a card title so the computed slug path differs from the remembered path, and the original file still contains `(id N)`
- **THEN** the system SHALL resolve that existing file as canonical and SHALL NOT create a file at the new slug until a successful rename of the same file

#### Scenario: Numbered duplicate is not chosen over the original

- **WHEN** both `Title.md` and `Title 1.md` contain the same note id footer
- **THEN** the system SHALL treat `Title.md` (non-numbered) as canonical

### Requirement: Title or board change renames the same file or keeps the remembered path

When the computed path differs from the remembered path and filesystem write is available, the system SHALL attempt to rename or move the canonical file to the new path and then remember the new path. If rename fails, the system SHALL keep writing the remembered path, SHALL warn the user, and SHALL NOT write a second file.

#### Scenario: Rename fails while Obsidian has the file open

- **WHEN** the computed path changed and renaming the vault file fails
- **THEN** subsequent sync writes SHALL update the original remembered path and SHALL NOT create a file at the new computed path

### Requirement: Filesystem permission is requested in the same user gesture as the click

Before scanning or writing the vault on Open in Obsidian or Notes-editor sync, the system SHALL request read/write permission on the linked directory handle in the same user gesture as that click, before other awaits that would drop Chrome’s user activation.

#### Scenario: User clicks Obsidian with a previously granted folder

- **WHEN** the user clicks Obsidian and a vault directory handle is stored
- **THEN** the system SHALL call directory `requestPermission` for readwrite as part of that click before vault file listing or writes

### Requirement: Pending editor content is flushed before vault compare or write

Before comparing or writing vault Markdown for a note, the system SHALL persist any open rich-text editor draft for that note to SQLite so the exported Markdown matches what the user last typed.

#### Scenario: User clicks Obsidian immediately after typing in Notes

- **WHEN** the notes editor for that card has unsaved debounced changes and the user activates Obsidian
- **THEN** those changes SHALL be written to SQLite before the vault file is read or compared

### Requirement: Sync and open operations return a typed result and surface errors

Sync and Open-in-Obsidian flows SHALL result in success, a conflict (when Markdown differs; see `obsidian-conflict-resolution`), or a visible error. The system SHALL present a readable message in the notes UI for permission denied, missing linked folder when Sync is on, write failure, and vault-name mismatch. The system SHALL NOT swallow those failures and continue to `obsidian://new`.

#### Scenario: Permission denied is visible

- **WHEN** the user activates Obsidian with Sync on and directory `requestPermission` does not return granted
- **THEN** the UI SHALL show an error that folder access was denied and SHALL NOT open `obsidian://new` for that note

#### Scenario: Write failure is visible

- **WHEN** creating or updating the canonical file fails after permission was granted
- **THEN** the UI SHALL show a write-failure error and SHALL NOT open `obsidian://new` as recovery

#### Scenario: Sync on without a linked folder is visible

- **WHEN** Sync mode is on, no vault directory handle is available, and the user activates Obsidian
- **THEN** the UI SHALL show that two-way sync needs a linked folder and SHALL NOT pretend the vault file was updated

### Requirement: URI-only mode is create-once then open and is not two-way sync

When Sync is off or no directory handle is available, the system SHALL treat Obsidian as URI-only. Settings SHALL state that two-way file sync requires a linked folder. The first successful create for a vault+note path MAY use `obsidian://new`. After the system has recorded that path as created, later launches SHALL use `obsidian://open` only.

#### Scenario: Second URI-only open uses open not new

- **WHEN** first-open tracking indicates the path was already created and no filesystem handle is in use
- **THEN** the system SHALL use `obsidian://open` and SHALL NOT use `obsidian://new` with body content

### Requirement: Opening obsidian:// does not rely on navigating the extension frame alone

When launching an `obsidian://` URL from a user action, the system SHALL prefer `chrome.tabs.create` when available, then a new-window / anchor fallback. The system SHALL NOT depend on assigning the extension document location to `obsidian:` as the only mechanism.

#### Scenario: Overlay host blocks frame navigation to obsidian:

- **WHEN** the user triggers Open in Obsidian while the popup runs in an embedded overlay
- **THEN** the protocol URL SHALL still be delivered via tab create or equivalent fallback without requiring the overlay iframe to navigate to `obsidian:`

### Requirement: First-open and path cache can be reset

The system SHALL provide a Settings control that clears stored first-open and remembered-path state for Obsidian so the next operation can recreate or remap if the user deleted the vault file.

#### Scenario: User clears cache after deleting the vault file

- **WHEN** the user invokes the reset control in Settings → Obsidian after deleting the mapped file in the vault
- **THEN** stored first-open and remembered-path keys for those notes SHALL be cleared so the next Sync create can write a new canonical file
