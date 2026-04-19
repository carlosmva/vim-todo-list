# Design: Obsidian true sync

## Context

The extension persists notes in SQLite and optionally maps each card to a Markdown file under a user-linked **vault root** (Chrome File System Access API) plus an **Obsidian vault name** for `obsidian://` links. Today’s implementation lives mainly in `popup.js`: `buildObsidianMarkdown`, path resolution by board/title slug, `syncNoteWithObsidianVault`, `pushNoteMarkdownToObsidianVault`, IndexedDB-backed `obsidian-vault-idb.js`, and optional navigation via `chrome.tabs.create` for custom schemes.

Constraints: the popup may run in **embedded** hosts that enforce strict **CSP** on `frame-src`, so assigning `window.location` to `obsidian://` is unsafe. Obsidian’s URI semantics mean **`obsidian://new` with content must not** be used to “refresh” an existing path (Obsidian creates numbered duplicates). File mtimes and SQLite `updated_at` can differ by milliseconds; naive `fileTime > updated_at` can wrongly prefer the vault after a save.

## Goals / Non-Goals

**Goals:**

- Vault-backed sync (when Sync mode + linked directory handle) is the **authoritative** path: read/write `.md` on disk, align `updated_at` with file mtime after writes where practical.
- **Deterministic** merge: compare normalized Markdown, compare timestamps with a **small slack** to avoid false “vault wins,” and offer an explicit conflict UI when still ambiguous.
- **Safe Obsidian open**: use `chrome.tabs.create({ url: obsidian://… })` (or equivalent) with anchor/assign fallbacks—never rely on navigating the extension frame alone.
- **No duplicate files from our URIs**: after the first successful create for a note path, use **`obsidian://open` only** for that path; never re-fire `new`+content for updates.
- **Flush in-memory editor** to SQLite before any merge so the DB reflects the latest rich text when the user clicks “Obsidian.”
- **Refresh vault file from DB** immediately before opening Obsidian when using FS sync so on-disk content matches what we open.

**Non-Goals:**

- Background Service Worker **periodic** vault sync (optional future work; not required to close “true sync” contract).
- Sync without user-granted **folder link** (URI-only mode remains best-effort: create once, then open).
- Editing Obsidian workspace settings or plugins.
- Non-Chromium browsers without File System Access.

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| **FS sync is primary when handle + Sync mode** | Full read/write control; no reliance on Obsidian URI for content pushes. | Rely on `obsidian://new` for each edit → duplicates; rejected. |
| **First path: `new`+content; later: `open` only** | Matches Obsidian behavior; avoids `note 1`, `note 2`. | Always `open` → cannot create initial file from extension without manual step. |
| **Open Obsidian via `chrome.tabs.create`** | Avoids parent `frame-src` CSP blocking `obsidian:` in embedded iframes. | `location.assign` only → breaks in some hosts. |
| **Slack (~750ms) on “vault newer than app”** | Filesystem mtime vs `Date.now()` skew. | Strict ms equality → spurious vault imports. |
| **Normalize Markdown before equality** | Reduces spurious diff from whitespace; still compare raw when user must choose. | Raw only → noisy conflicts. |
| **`navigateOpenOnly` re-reads DB + rewrites file + then opens** | Guarantees disk matches SQLite before Obsidian reads file; fixes stale merges after `na === nf` skip. | Trust single earlier write → user-reported stale note. |
| **`flushPendingNotesEditorSave` before `syncNoteWithObsidianVault`** | Debounced save may not have run; ensures DB has latest HTML. | Rely on blur order only → race on quick click. |
| **Keep “first open” cache in `localStorage` (path keys only)** | Remember `new` vs `open` per vault+noteId. | Hash-based re-`new` → duplicates; removed. |
| **IndexedDB for directory handle** | Browser persists handle across sessions; `requestPermission` when needed. | Re-pick folder every session only → poor UX. |

## Risks / Trade-offs

- **[Risk] Overwriting user edits in Obsidian** if vault file is newer and import branch runs → **Mitigation:** Slack + conflict modal on ambiguous cases; user-visible “use app vs vault.”
- **[Risk] Double writes** (flush push + sync pre-open write) **Mitigation:** Acceptable I/O cost for correctness; same content idempotent.
- **[Risk] Obsidian buffers open file** → UI looks stale briefly → **Mitigation:** Touch file right before open; user can close/reopen note in Obsidian if needed (document in settings).
- **[Risk] `chrome.tabs.create` unavailable** (rare) → **Mitigation:** Anchor `target=_blank` fallback, then `location.assign`.
- **[Trade-off]** URI-only users cannot get automatic overwrite of existing files via protocol handlers; must use Sync mode + folder for true two-way file sync.

## Migration Plan

- **Deploy:** Ship implementation behind existing Settings toggles (vault name, Sync mode, linked folder). No SQLite schema change required for the design as stated.
- **Rollback:** Revert sync logic in `popup.js`; users keep vault files on disk; extension DB unaffected.
- **User data:** Optional “Reset first-open cache” continues to reset `obsidianPathCreated_v1:*` keys for URI recovery.

## Implementation notes (apply pass)

- **Spec alignment:** `popup.js` behavior matches `specs/obsidian-vault-sync/spec.md` for this change; no intentional deviations identified at apply time.
- **`chrome.tabs.create`:** Manifest does **not** list the `tabs` permission; MV3 allows `chrome.tabs.create({ url })` from extension popups without it for ordinary tab creation (including custom schemes). Adding `tabs` was skipped to avoid an extra permission prompt; if a Chrome channel ever rejects `create`, add `"tabs"` (or narrow host permission) per error message.
- **Debounced vault push:** Notes editor autosave (`flushNotesEditorToDbAndVault` on debounced `input`) already calls `pushNoteMarkdownToObsidianVault` when Sync mode and vault name are set—no separate spike required for “push on save without Obsidian click.”
- **Orphan vault files:** When a card **title** or **board** changes, `obsidianRelativeFilePath` may point at a **new** `.md` basename. The extension does **not** delete or rename the old vault file automatically; the prior file may remain until the user removes it in Obsidian or the file manager.

## Open Questions

- Should **automatic** vault push happen on every note save (debounced) without an Obsidian button click, and if so, throttle policy?
- Should **filename** change when card title changes — move vs. duplicate file in vault (current slug-based paths may imply new file)?
- **`tabs` manifest permission:** Confirm minimum permission set for `chrome.tabs.create` with `obsidian:` URLs across Chrome channels.
