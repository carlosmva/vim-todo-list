## Context

See proposal.md for motivation. Card-first sync (`obsidian-sync-workflow`) already maps each existing SQLite note to one vault file via remembered path and `(id N)` footer. `syncWithVault` returns `ok` when no file exists for that card—it never creates a card from a vault-only file.

Reusable pieces: `noteIdFromVaultMarkdown`, `pickCanonicalVaultFile`, `collectMarkdownInDirectory` (today called with depth 0 inside one board folder), `parseObsidianMarkdownImport` (title + body only), `rememberFilePath`, `ensureVaultAccess`, Settings → Obsidian (`vaultLinkedName`, Sync checkbox). `insertNote` always AUTOINCREMENT and cannot preserve a vault id.

Constraints: File System Access `requestPermission` must run in the same click as compare; SQLite ids are the identity shared with vault footers; import must not write vault files.

## Goals / Non-Goals

**Goals:**

- Two-phase Settings action: compare (read-only) then confirm import.
- Notes-folder scan that buckets files into missing / already-present / ignored.
- Insert missing ids with the footer id, bumping `sqlite_sequence` when needed.
- Remember paths for both imported and already-present ids.
- Extend Markdown parse enough to restore board, status, and due.

**Non-Goals:**

- Auto-run after database import or folder pick.
- Importing files without a footer.
- Bulk conflict modal or silent overwrite when an existing id differs.
- Walking the vault root or deleting `Name 1` copies.
- URI-only import.
- Changing per-note Open/Notes sync behavior.

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| **Two-phase `compareVaultNotes()` then `importMissingVaultNotes(compare)`** | Spec requires a read-only summary and confirm. Passing the compare result into import avoids a second walk and a stale permission drop. | One-click import → no compare. Re-scan on confirm → extra FS work; permission may already be granted. |
| **Settings → Obsidian button, enabled when a folder name is linked and Sync is on** | Same surface as vault pick / path cache. Permission can ride the click. | Data tab → wrong place for FS access. Auto after import → no user gesture for permission; surprising inserts. |
| **Walk `{notesFolder}/*/*.md` only** | Matches how sync writes files (`folder/board-slug/title.md`). Sibling change rejected vault-root walks for a reason. | Depth-3 from vault root → daily notes and `.obsidian` noise. |
| **Identity = footer `(id N)` only** | Same key as database import. Filename slugs are not stable. | Title match → duplicates after rename. |
| **`insertNoteWithId` + `sqlite_sequence` bump** | AUTOINCREMENT would mint a new id and the next sync could write a second file. Sequence must be at least `MAX(id)` after explicit inserts. | Insert then `UPDATE id` → SQLite forbids changing PRIMARY KEY cleanly. |
| **Parse board / status / due on import; priority stays `normal`** | Footer and `**Due:**` already exist in exported Markdown. Priority is not serialized. | Title+body only → cards land on the current board and lose complete/due. |
| **Create missing boards via existing `addBoard`** | Footer board is the display name, not the slug. | Dump onto the active board → wrong grouping after import. |
| **Remember path for already-present ids without updating note content** | Reunites path cache after a DB import so Open/Sync finds the file. Content diffs stay on the existing conflict modal. | Keep-vault during compare → silent overwrite. Queue conflicts → out of scope. |
| **Canonical file via existing `pickCanonicalVaultFile`** | Prefer `Title.md` over `Title 1.md` for the same id. | Import every copy → duplicate cards (blocked by unique id) or wasted work. |
| **`created_at` / `updated_at` from file mtime when importing** | No original create time in the Markdown. File mtime is the only disk clock. | `Date.now()` for both → due/calendar sort looks brand new. |
| **Vault files stay read-only during this flow** | Import is database-side. Writing would collide with “do not invent a second file” and is unnecessary. | Stamp footers on orphans → rejected (orphans are out of scope). |

**Compare → import flow:**

1. User clicks **Compare vault** on Settings → Obsidian.
2. `ensureVaultAccess()` in that gesture; abort with a Settings error if Sync off, no handle, or permission denied.
3. Resolve notes-folder directory; list immediate subdirectories; collect `.md` in each (no further recursion).
4. Group by `noteIdFromVaultMarkdown`; pick canonical file per id; ignore no-footer files.
5. For each id: `queryNote(id)` → already-present (optionally `markdownDiffers`); else missing.
6. Show summary: missing titles (enough to sanity-check the folder), already-present count, differ count, ignored count.
7. On confirm: for each missing id, `addBoard` if needed, `insertNoteWithId`, `rememberFilePath`. For each already-present id, `rememberFilePath` only.
8. Refresh boards/notes list; show imported / skipped / ignored result.

## Risks / Trade-offs

- **[Risk] Explicit insert of a high id leaves AUTOINCREMENT behind** → Mitigation: after import, set `sqlite_sequence.seq` to `MAX(notes.id)` so the next new card does not collide.
- **[Risk] Notes folder setting points at vault root** → Mitigation: still only one directory level of children; ignored count will be high; summary titles let the user cancel.
- **[Risk] Footer board name does not match the directory slug** → Mitigation: trust the footer board string (same as export); path memory stores the actual file path.
- **[Risk] Compare result goes stale if the user edits the vault before confirm** → Mitigation: accept; import uses the in-memory compare snapshot. A second compare is available.
- **[Trade-off] No orphan import** — safer than minting ids onto unrelated Markdown.
- **[Trade-off] Differing existing ids are only counted** — avoids a Settings-hosted conflict stack; user opens the card later.

## Migration Plan

- No SQLite schema change. New repository method only.
- Path map keys stay `obsidianVaultFilePathByNoteId_v1`.
- Deploy beside existing Settings Obsidian controls. Button remains inert until Sync + linked folder.
- Rollback: remove compare/import UI and repository insert-with-id; existing notes and vault files unchanged.

## Open Questions

None. Scan-then-confirm, footer-only matching, and no bulk conflict were decided in exploration.
