## Why

Obsidian integration exists, but it is not a workflow users can trust. In practice it creates extra vault files (`Note 1`, `Note 2`), swallows filesystem and permission failures, and often fails to show a usable diff when the card and the vault disagree. A previous `obsidian-true-sync` change was archived without proving the happy path in a real vault. This change is needed now so linking a vault means one file per card, visible errors, and an explicit conflict UI—not silent copies or empty dialogs.

## What Changes

- Define a **single, repeatable workflow**: configure vault → grant folder access → each card maps to exactly one Markdown file → open/sync updates that file (or asks the user) → never create a second file for the same card.
- Make **file identity** the source of truth: remember the actual vault path for a note, find that file before creating, and treat `obsidian://new` as last-resort create only when no file exists—not as a fallback after a failed scan or write.
- **Surface failures** instead of falling through to protocol create: permission denied, folder unlinked, write error, and vault-name mismatch must be visible in the UI.
- Make **conflict resolution actually usable**: when card Markdown and vault Markdown differ, show a readable side-by-side diff and let the user keep the card, keep the vault, or cancel. Do not overwrite silently, and do not present an empty or unstyled preview.
- Clarify **title/board changes**: either move/rename the mapped file or keep writing the remembered path; do not leave the user with two notes and no explanation.
- Keep URI-only mode (no folder grant) as best-effort open/create, clearly labeled as not two-way sync.

## Capabilities

### New Capabilities

- `obsidian-vault-sync`: End-to-end workflow for linking a vault, mapping each card to one Markdown file, reading/writing via the File System Access API when Sync mode is on, opening Obsidian without spawning duplicates, and reporting errors when access or writes fail.
- `obsidian-conflict-resolution`: Conflict UX when extension Markdown and vault Markdown differ—visible line-level diff, keep-card / keep-vault / cancel, no silent overwrite.

### Modified Capabilities

- *(none)* — Existing main specs (`angular-extension-shell`, `primeng-ui-layer`, `compact-json-persistence`, `note-due-dates`, `calendar-view`, `note-prioritization`, `popup-text-link-controls`) do not change their requirements. Obsidian behavior is additive. The archived `obsidian-vault-sync` spec was never promoted to `openspec/specs/` and is replaced by the capabilities above.

## Impact

- **Code:** `ObsidianService`, vault scan/path helpers, notes open/sync flow, Settings → Obsidian, conflict modal (template + styles), IndexedDB vault handle (`obsidian-vault-idb.js` / picker).
- **Platform:** Chromium File System Access + persisted directory handle; `obsidian://open` / `obsidian://new`; extension overlay/CSP constraints for protocol URLs.
- **Risk:** Incorrect merge or create can duplicate or overwrite vault notes. All writes stay behind explicit vault link + Sync mode; ambiguous content always goes through the conflict UI.
- **Verification:** This change is not done until a real vault walkthrough proves: no duplicate files, errors are visible, and the diff is readable when content diverges.
