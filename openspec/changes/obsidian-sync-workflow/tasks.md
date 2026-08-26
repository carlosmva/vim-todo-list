## 1. Typed results and stop duplicate fallback

- [x] 1.1 Add an `ObsidianOpResult` type (`ok` | `conflict` | `error` with codes: permission-denied, no-folder, write-failed, vault-mismatch, lookup-failed) on `ObsidianService`
- [x] 1.2 Change `syncWithVault` / `syncBeforeEditorOpen` / `navigateToNote` / `openInObsidian` to return that result instead of throwing or returning only a conflict
- [x] 1.3 Remove empty `catch` fallthrough in `notes.component.ts` `openInObsidian` and `toggleEditor` that continues to `obsidian://new` or protocol open after a sync failure
- [x] 1.4 When Sync + folder are active, never call `buildNewUrl` / `obsidian://new` after a lookup miss, permission failure, or write failure

## 2. Canonical file identity and lookup

- [x] 2.1 Restrict `findVaultNoteFile` to remembered path → computed path → board-directory `(id N)` scan; remove vault-root deep walk as the primary lookup
- [x] 2.2 Keep preferring non-numbered filenames (`Title.md` over `Title 1.md`) when multiple files share the same `(id N)` footer
- [x] 2.3 Remember the chosen canonical path after every successful find or write
- [x] 2.4 On title/board slug change, attempt rename/move of the canonical file to the new computed path; on failure keep writing the remembered path and do not create a second file

## 3. Permission, flush, and filesystem create

- [x] 3.1 Call `ensureVaultAccess()` / `requestPermission` in the same click as Open Obsidian and Notes-editor sync, before any other await
- [x] 3.2 Flush the open rich-text editor for that note to SQLite before vault compare or write
- [x] 3.3 First create with Sync + folder: write one file at the computed path, remember it, then `obsidian://open` only
- [x] 3.4 Existing file with Sync + folder: write that same path (after conflict resolution if needed), then `obsidian://open` only

## 4. Visible errors and Settings copy

- [x] 4.1 Show a notes-view error message for permission denied, missing linked folder when Sync is on, write failure, and vault-name mismatch
- [x] 4.2 Update Settings → Obsidian copy: two-way sync requires a linked folder; URI-only is create-once then open
- [x] 4.3 Add Settings control to clear first-open cache and remembered vault paths
- [x] 4.4 On failed rename, show a non-blocking warning that the original filename was kept

## 5. URI-only and protocol open

- [x] 5.1 URI-only (Sync off or no handle): `obsidian://new` only on first-open cache miss; later opens use `obsidian://open` only
- [x] 5.2 Keep `chrome.tabs.create` then `<a target=_blank>` for `obsidian://`; do not navigate the extension frame as the only mechanism
- [x] 5.3 URI-only flows MUST NOT present the conflict UI

## 6. Conflict modal (visible diff)

- [x] 6.1 Port conflict modal layout/diff styles from `popup.css` into `obsidian-conflict-modal.component.scss` (panel, grid, `pre`, added/removed lines, dark themes)
- [x] 6.2 If normalized Markdown differs, always present the modal; do not auto-import or auto-export by timestamp
- [x] 6.3 Keep-card writes the card Markdown to the canonical path; keep-vault imports into SQLite without rewriting the vault; cancel writes nothing
- [x] 6.4 After keep-card/keep-vault, continue the original action (open editor or `obsidian://open`); cancel does not continue
- [x] 6.5 Confirm keyboard: `1` keep-card, `2` keep-vault, Escape cancel, arrows move focus
- [x] 6.6 Keep the modal hosted on `app` root so overlay overflow cannot clip it

## 7. Tests

- [x] 7.1 Unit-test lookup order and non-numbered canonical pick (`obsidian-vault-scan.util`)
- [x] 7.2 Unit-test conflict diff lines and large-note plain-preview fallback (`obsidian-conflict-diff.util`)
- [x] 7.3 Unit-test that Sync-mode navigate never emits `obsidian://new` on lookup/write failure (service with mocked vault)

## 8. Real-vault verification (done gate)

- [ ] 8.1 Create a card, Open Obsidian, confirm one `.md` file; open again, confirm still one file (no `Name 1`)
- [ ] 8.2 Edit in the extension and in Obsidian until Markdown differs; confirm a readable side-by-side diff; keep-card and keep-vault each work; cancel leaves both unchanged
- [ ] 8.3 Deny folder permission (or unlink folder with Sync on) and confirm a visible error and no new vault file
- [ ] 8.4 Rename a card title; confirm the same file is updated or renamed, not a second file
- [ ] 8.5 URI-only (Sync off): first open may create; second open does not spawn a numbered copy
