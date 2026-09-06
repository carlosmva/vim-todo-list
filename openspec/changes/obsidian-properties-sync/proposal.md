## Why

Obsidian Properties are a YAML frontmatter block (`---` … `---`) at the top of a note. The extension currently treats that block as body Markdown: adding properties in Obsidian makes the whole-file compare fail, the conflict line-diff lines up against the footer `---` and looks like a rewrite, and keep-card / push overwrite the vault file without the properties. Users who assign Properties in Obsidian cannot sync without a false, unreadable conflict.

## What Changes

- Treat a leading Obsidian Properties block as structured metadata, not note body.
- Compare card vs vault on body Markdown plus known fields (due, status, board, id)—not the raw file including frontmatter—so adding Properties does not by itself open the conflict UI or scramble the git-style line diff.
- Sync known card fields into Properties on write (`due`, `status`, `board`, `priority`, `vim-todo-id`) and read them back on import; keep the existing body due line and `(id N)` footer for backward compatibility and vault lookup.
- Preserve unknown Properties (tags, aliases, cssclasses, user keys) when writing the card over the vault.
- When known Properties disagree with the card, show those field diffs in the conflict UI; the side-by-side preview stays body-only.

## Capabilities

### New Capabilities
- `obsidian-note-properties`: Parse, compare, import, and write Obsidian YAML Properties; keep body diffs readable; preserve user Properties on export.

### Modified Capabilities
- *(none)* — Main specs do not yet include `obsidian-vault-sync` / `obsidian-conflict-resolution`. This change adds a sibling capability; it does not rewrite those unpublished requirement sets.

## Impact

- **Code:** `obsidian-markdown.util` (split/parse/serialize frontmatter, build/parse/compare), `ObsidianService` (sync equality, write merge, import), `NotesRepository.updateNoteFromVault` (due/status/board), conflict modal (body-only diff + property field rows).
- **Vault files:** Writes MAY add or update a Properties block on files the extension already maps. Unknown keys are not deleted. Footer `(id N)` and `#vim-todo/*` tags stay so lookup still works.
- **Dependencies:** No new YAML library; flat Obsidian Properties only.
- **UI:** Conflict modal gains a small Properties comparison when known fields differ; body previews no longer include the `---` Properties fence.
