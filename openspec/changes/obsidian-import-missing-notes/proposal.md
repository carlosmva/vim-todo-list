## Why

After a SQLite database import, two-way Obsidian sync only works for cards that already exist in the database. Vault Markdown files that carry a Vim To-Do `(id N)` footer but have no matching row stay invisible. Users who reunite an imported database with a verified vault need a way to compare the notes folder and import those missing cards without creating a second note for an id the database already has.

## What Changes

- Add a **manual Settings → Obsidian action** that runs only when Sync mode is on and a vault folder is linked and writable: scan the configured notes folder, show a compare summary, and import only after the user confirms.
- **Match by task id** in the vault footer `(id N)`. If the imported database already has that id, do not insert another card. Remember the canonical vault path so later Open/Sync uses the same file.
- **Import vault-only ids** as SQLite notes that keep that same id (not AUTOINCREMENT). Restore title, body, board, status, and due from the Markdown; create the footer board if it does not exist.
- **Ignore files without a footer** (native or unrelated Obsidian notes). Do not mint new ids for them.
- When the same id exists on both sides but Markdown differs, **count it in the summary** and leave resolution to the existing per-note conflict UI. Do not open a bulk conflict queue.
- Walk `{notesFolder}/{board}/*.md` only. Do not walk the vault root. Prefer `Title.md` over `Title 1.md` when several files share one id.

## Capabilities

### New Capabilities

- `obsidian-vault-import`: Compare a linked vault’s notes folder to SQLite after the vault is writable; import missing `(id N)` files as notes with preserved ids; skip ids already in the database; report imported / already-present / ignored counts.

### Modified Capabilities

- *(none)* — Main specs (`angular-extension-shell`, `primeng-ui-layer`, `compact-json-persistence`, `note-due-dates`, `calendar-view`, `note-prioritization`, `popup-text-link-controls`) do not change. Sibling change `obsidian-sync-workflow` stays card-first sync and conflict UX; this change only adds vault→database import of missing ids.

## Impact

- **Code:** `ObsidianService` (folder scan + compare/import), `NotesRepository` (insert with explicit id + `sqlite_sequence` bump, board bootstrap), markdown parse (board/status/due), Settings → Obsidian UI.
- **Platform:** Same File System Access directory handle as existing sync. Permission must be requested in the compare click. URI-only mode has no files to read and is out of scope.
- **Risk:** Inserting the wrong id or walking outside the notes folder can duplicate cards or import unrelated Markdown. Guard with footer-only matching, notes-folder scan, and a confirm step before writes.
- **Data:** SQLite `notes` / `boards` rows only. Vault files are read, not rewritten, during import.
