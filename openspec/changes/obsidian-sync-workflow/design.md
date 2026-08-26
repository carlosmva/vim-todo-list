## Context

The Angular popup already has Obsidian wiring: `ObsidianService` (File System Access read/write, path memory, `obsidian://` open/new), vault scan by remembered path / slug / `(id N)` footer, Settings → Obsidian, and a conflict modal rendered at app root.

That stack still fails in use:

- **Duplicates:** `navigateToNote` falls through to `obsidian://new` when a scan or write throws or returns null. Obsidian then creates `Note 1` / `Note 2`. Permission is requested after other awaits, so Chrome can expire the user-gesture and the scan looks empty.
- **Silent errors:** Callers wrap sync in empty `catch` and continue to protocol open. Users see extra files, not the real failure (denied folder, unlinked handle, write error).
- **Missing diff:** The conflict template exists, but layout/diff styles live in legacy `popup.css`, which the Angular build does not apply. The component SCSS only toggles `:host` visibility. The modal can open with no readable side-by-side diff.
- **Unstable identity:** Title/board slug changes compute a new path. If lookup misses (permission, case, folder root vs notes folder), a second file is written. Vault-wide scans (depth 3 from root) are slow and can pick the wrong copy.

Constraints: Chromium File System Access (persisted directory handle in IndexedDB); `requestPermission` must run in the same user gesture as the click; overlay CSP can block navigating the extension frame to `obsidian://`; SQLite remains the app store; vault `.md` is a projection.

## Goals / Non-Goals

**Goals:**

- One Markdown file per card when Sync mode and a vault folder are granted.
- A typed sync result (`ok` | `conflict` | `error`) so the UI never “recovers” by creating another note.
- `obsidian://new` only for true first create in URI-only mode—not after a failed filesystem operation.
- Conflict modal with a visible line-level diff and keep-card / keep-vault / cancel.
- Permission requested in the click gesture before any other await.
- Lookup order that prefers the remembered path and `(id N)` footer over inventing a new slug file.

**Non-Goals:**

- Background / service-worker periodic sync.
- Two-way sync without a linked folder (URI-only stays create-once then open).
- Deleting user-created duplicate files already in the vault (may *prefer* the canonical file going forward; cleanup is manual).
- Syncing to non-Chromium browsers without File System Access.
- Changing Obsidian app settings or plugins.

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| **Typed `ObsidianOpResult` instead of throw-and-fallthrough** | Callers can present conflict, show an error banner, or proceed. Empty `catch` → `obsidian://new` is the duplicate bug. | Keep exceptions + catch in the notes component → same failure mode. |
| **Never call `obsidian://new` after an FS miss or write failure** | A failed scan is not “file does not exist.” Creating via URI is how numbered copies appear. | Fall back to `new` for “recovery” → rejected; that is current behavior. |
| **`obsidian://new` only in URI-only mode on first-open cache miss** | Without a folder handle we cannot know if the file exists. One `new` then `open` forever for that note/vault. | Always `open` in URI-only → first create never happens. Always `new` → duplicates. |
| **When Sync + handle: create via FS write, then `obsidian://open` only** | Disk is source of truth for content; Obsidian opens the file we wrote. | `new`+content after FS write → duplicate if path mapping differs. |
| **Canonical file = remembered path, else file whose Markdown footer is `(id N)`** | Note id in the exported Markdown is stable across title edits. Slug is a hint, not identity. | Slug-only paths → new file on every rename. |
| **Lookup order: remembered → computed → board folder scan for `(id N)`. No vault-root deep walk.** | Deep scans are slow, hit permission edges, and can match numbered copies in the wrong folder. | Keep depth-3 root walk → current unreliability. |
| **Title/board change: keep writing the remembered file; attempt rename to the new computed path; on rename failure keep the old path and warn. Never write a second file.** | Stops orphans *and* duplicates. Filename can lag the title if rename fails; that is better than two notes. | Always rewrite at new slug → duplicates. Never rename → stale names forever (acceptable fallback only). |
| **If normalized Markdown differs, always show the conflict modal (no silent mtime import/export)** | Users asked for a visible diff. Auto-picking by clock caused lost edits and “nothing happened.” Equal Markdown still aligns `updated_at` to file mtime. | Auto-import when vault mtime is newer → silent overwrite. |
| **Port conflict styles into the Angular component SCSS (from `popup.css`)** | Angular does not load `popup.css`. Without panel/grid/`pre`/diff-line rules, the preview is effectively blank. Host the modal at app root (already) so overflow clipping cannot hide it. | Depend on global legacy CSS → current “no diff” bug. |
| **Surface errors in the notes view (and Settings for folder/permission state)** | Permission denied, no linked folder (when Sync is on), write failure, and vault-name mismatch must be readable. Settings already has vault picker; sync errors on Open/Notes need an in-view message, not only console. | Toast-only / console-only → easy to miss. |
| **`ensureVaultAccess()` first, same click, before scan/write** | Chrome expires the File System Access user-activation if other awaits run first. | Request permission inside `getVaultContext` after DB work → scan fails, then `new`. |
| **Prefer `chrome.tabs.create` for `obsidian://`, then `<a target=_blank>`** | Overlay `frame-src` CSP can block `location.assign`. Do not add a `tabs` permission unless a Chrome channel requires it. | Navigate the popup document → broken in embedder. |

**Sync workflow (happy path, Sync on + folder granted):**

1. User clicks **Obsidian** (or opens **Notes**, which pulls first).
2. Request folder permission in that gesture.
3. Flush the rich-text editor for that card to SQLite.
4. Resolve canonical file (remembered / computed / board `(id N)`).
5. If Markdown differs → conflict modal (diff visible) → apply choice → then continue (open editor or Obsidian).
6. If same or user chose a side → write that Markdown to the **same** path (when opening Obsidian or after keep-card) → `obsidian://open` that path.
7. If no file exists → write once at computed path → remember path → `obsidian://open`.

**URI-only (no folder or Sync off):** show that two-way sync is off. First successful create may use `obsidian://new`; later opens use `open` only. No conflict diff (nothing to read from disk).

## Risks / Trade-offs

- **[Risk] Existing `Note 1` copies stay in the vault** → Mitigation: resolve by `(id N)` and prefer non-numbered names; do not delete extras; document manual cleanup.
- **[Risk] Rename on title change fails (locked file, Obsidian has it open)** → Mitigation: keep remembered path; warn; never create a second write.
- **[Risk] Footer `(id N)` missing on old files** → Mitigation: remembered path and computed path still work; Settings “clear path cache” remains for recovery.
- **[Risk] Conflict modal still clipped in overlay** → Mitigation: keep modal on `app` root with high z-index; verify in overlay and action popup.
- **[Risk] `chrome.tabs.create` rejects `obsidian:`** → Mitigation: keep anchor fallback; add `tabs` permission only if a channel requires it.
- **[Trade-off] No automatic vault-wide cleanup of duplicates** — safer than deleting user Markdown.
- **[Trade-off] URI-only users cannot get a real diff** — requires linked folder.

## Migration Plan

- No SQLite schema change. Path map (`obsidianVaultFilePathByNoteId_v1`) and first-open keys stay; logic around them gets stricter (no `new` after FS failure).
- Deploy with existing Settings (vault name, notes folder, Sync mode, choose folder). Copy should state: Sync needs a linked folder; URI-only will not two-way sync.
- Rollback: revert Angular Obsidian services/modal styles; vault files on disk and SQLite notes remain.
- Verification gate (required before calling this done): in a real vault, create a card, open Obsidian, edit both sides, confirm one file, visible error if folder access is denied, and a readable diff when content diverges.

## Open Questions

- Should opening **Notes** (editor) always pull from vault first (current) or only when the user clicks **Obsidian**? Pull-on-editor-open is good for freshness but makes every Notes click a permission/sync event.
- After the user keeps the vault in a conflict that was triggered from **Obsidian**, should we still open Obsidian automatically (current `afterResolve: 'obsidian'`)?
- Do we show a one-time banner listing extra numbered files found for a note id, or stay silent and only bind the canonical file?
