# Tasks: obsidian-true-sync

## 1. Verify vault sync core paths

- [x] 1.1 Confirm `syncNoteWithObsidianVault` uses File System Access read/write when Sync mode is on and `obsidianVaultRootHandle` is non-null; confirm URI-only path is not used for content pushes in that case
- [x] 1.2 Confirm `flushPendingNotesEditorSave` runs at the start of `syncNoteWithObsidianVault` and clears the debounce timer shared with the notes editor autosave
- [x] 1.3 Confirm `navigateOpenOnly` (or equivalent) re-reads the note from SQLite, writes `buildObsidianMarkdown` to the vault path, bumps `updated_at` from file mtime, persists, then opens `obsidian://` via `openObsidianProtocolUrl`
- [x] 1.4 Confirm merge uses normalized Markdown equality and `OBSIDIAN_VAULT_NEWER_SLACK_MS` (or equivalent) before importing vault-over-app

## 2. Verify Obsidian URI and CSP behavior

- [x] 2.1 Confirm `resolveObsidianUrlForNote` uses `obsidian://new` with content only when first-open cache misses; after mark, uses `obsidian://open` only (no `new`+content for updates)
- [x] 2.2 Confirm `openObsidianProtocolUrl` prefers `chrome.tabs.create({ url })`, then anchor `target=_blank`, then `location.assign` fallback
- [x] 2.3 Confirm manifest permissions are sufficient for `chrome.tabs.create` with `obsidian:` URLs on target Chrome channel; add `tabs` if required

## 3. Conflict UX and recovery

- [ ] 3.1 Manually verify conflict modal appears when normalized content differs and timestamps are ambiguous per slack rules
- [x] 3.2 Verify “Reset first-open cache” clears `obsidianPathCreated_v1:*` keys and Settings copy explains when to use it

## 4. Specs and regression checks

- [ ] 4.1 Walk through `specs/obsidian-vault-sync/spec.md` scenarios in a real vault (create note, edit in extension, open Obsidian, edit in Obsidian, sync again)
- [x] 4.2 Document any intentional deviations from the spec in `design.md` or a short implementation note if needed

## 5. Optional follow-ups (non-blocking)

- [x] 5.1 Spike: debounced vault push on every note save without requiring Obsidian button (per design open questions)
- [x] 5.2 Document behavior when card title changes and slug/path changes (orphan file in vault)
