## 1. Parse and scan helpers

- [x] 1.1 Extend Markdown import parse to return board, status, and due (plus existing title/body) from footer, `#vim-todo/complete|pending`, and `**Due:**`, and verify unit tests cover those fields and a missing footer
- [x] 1.2 Add a notes-folder collector that lists `{notesFolder}/{board}/*.md` only (no vault-root walk), groups by `(id N)`, picks the canonical file per id, and counts no-footer files, and verify unit tests with a mocked directory tree

## 2. Preserve ids on insert

- [x] 2.1 Add `insertNoteWithId` (explicit id, board, title, body, status, due, timestamps) and bump `sqlite_sequence` to `MAX(notes.id)`, and verify a unit/repo test that the next `insertNote` does not collide with the imported id
- [x] 2.2 Create the footer board via `addBoard` when missing before insert, and verify a note lands on a newly created board name

## 3. Compare and import on ObsidianService

- [x] 3.1 Add `compareVaultNotes()` that calls `ensureVaultAccess()` first, buckets missing / already-present / ignored, flags already-present ids whose normalized Markdown differs, and remembers nothing yet, and verify it returns an error result for no-folder and permission-denied without inserting notes
- [x] 3.2 Add `importMissingVaultNotes(compare)` that inserts only missing ids, remembers paths for missing and already-present ids, never writes vault files, and never opens the conflict modal, and verify a service test with mocked vault + repo
- [x] 3.3 When several files share one id, import or remember only the canonical (non-numbered) path, and verify the numbered copy is not inserted as a second note

## 4. Settings UI

- [x] 4.1 Add Compare vault on Settings → Obsidian, enabled when Sync is on and a folder is linked, and verify the control is absent or disabled in URI-only / no-folder state
- [x] 4.2 Show a read-only summary (missing titles, already-present count, differ count, ignored count) with Confirm import and Cancel, and verify Cancel leaves the database unchanged
- [x] 4.3 After confirm, refresh boards/notes and show imported / skipped / ignored counts, and verify a missing vault-only id appears as a card with that same id
- [x] 4.4 Surface compare errors (no folder, permission denied) in Settings copy, and verify no notes are inserted on those paths

## 5. Verification

- [x] 5.1 Import a database that already contains ids present in the vault, run compare, and verify those ids stay single cards (no duplicates) and path cache points at the canonical file
- [x] 5.2 Add a vault-only `(id N)` file under the notes folder, confirm import, and verify one card with that id, board, status, and due, and the vault file bytes unchanged
- [x] 5.3 Leave a no-footer Markdown file in the notes folder and verify it is counted as ignored and not imported
