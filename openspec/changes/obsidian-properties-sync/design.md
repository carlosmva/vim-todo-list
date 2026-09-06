## Context

See proposal.md for motivation. Sync already builds a canonical vault projection with `buildObsidianMarkdown` (title, optional `**Due:**` line, body, `---` + `*Board: … (id N)*` + `#vim-todo/*`) and compares `normalizeObsidianMarkdown` of that string to the raw file. Obsidian Properties is a *leading* `---` YAML fence—the same token as the footer rule—so the LCS line-diff treats the closer as the footer and shifts every following line. `pushNote` / keep-card rewrite with `buildObsidianMarkdown` and drop the fence. Import starts at line 0 and can miss `# Title` or swallow the fence into `notes_html`. `updateNoteFromVault` writes only title and body, so even a correct parse cannot apply `due` / `status` / `board`.

Constraints: no new YAML dependency; File System Access write still replaces the whole file; footer `(id N)` remains the scan identity; SQLite schema already has the known fields.

## Goals / Non-Goals

**Goals:**

- Split a closed leading fence from body before parse, compare, and diff.
- Compare structured projection (normalized body + known fields), not raw file text.
- Merge known keys from the card into Properties on every mapped write; keep unknown keys.
- Import known Properties into SQLite (including keep-vault and missing-note import).
- Show body-only line diffs; list known Property mismatches separately.

**Non-Goals:**

- Nested YAML, `!` tags, or multi-document streams.
- A Properties editor in the extension UI.
- Replacing the footer / body due line (they stay for lookup and older files).
- Syncing arbitrary Obsidian types (checkboxes, relations) beyond the known scalar/list keys.
- Changing when the conflict modal appears for *body* disagreements (still always, no mtime auto-pick).

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| **Fence = first line `---` plus a later line that is only `---`** | Matches Obsidian Properties. An unclosed leading rule stays body so `---` horizontal rules are not eaten. | Treat any first `---` as Properties → breaks notes that start with an hr. |
| **Tiny flat YAML parser (scalars + one-level lists)** | Obsidian Properties are almost always `key: value` or `key: [a, b]` / dashed lists. Avoids a dependency in the extension bundle. | `js-yaml` → size and CSP surface for little gain. |
| **Known keys: `due`, `status`, `board`, `priority`, `vim-todo-id`** | These are the SQLite columns we can round-trip. `due` is `YYYY-MM-DD` (UTC date, same as the body due formatter). | Put identity only in Properties and drop the footer → breaks existing vault scan. |
| **Properties win on import when they disagree with body/footer** | The user edited Properties in Obsidian; that is the new source for those fields. | Body wins → Properties look unsynced. Last-write-wins by mtime → rejected by sibling conflict spec. |
| **Always emit a Properties block on write** | Syncing Properties is the feature; structured compare means adding the block is not a false conflict. Files that never had Properties pick up known keys on the next keep-card / Open Obsidian write. | Emit only if a fence already exists → Properties never appear unless the user added them first; weaker “syncing”. |
| **Unknown keys copied through as parsed values, not raw text slices** | Lets us rewrite known keys in a stable order (`due`, `status`, `board`, `priority`, `vim-todo-id`, then unknown keys in original order) without dropping tags. | Raw-slice preserve → harder to update `due` in place; more brittle. |
| **Equality = `normalize(bodyWithoutFence)` vs `normalize(buildObsidianMarkdown(note))` AND known fields equal** | Fixes the “I only added Properties” false conflict. Unknown extra keys are ignored for equality (they are not card state). | Strip fence then still string-compare including unknown YAML → still conflicts on tags. |
| **Conflict payload stores body Markdown; properties diffs are a separate list** | The git-style preview must not see the leading fence. Property-only conflicts still need something visible. | Diff the full file → current bug. |
| **`updateNoteFromVault` applies title, body, `due_at`, `status`, `board`, `priority`** | Otherwise keep-vault cannot honor Properties. Board change stays the note’s board string (same as footer import today); it does not move vault folders by itself. | Title/body only → Properties status/due never land. |

**Write merge:**

1. Read existing file Markdown if the path exists (else empty).
2. Parse fence → `{ known, unknown }`.
3. Overlay known keys from the card (omit `due` when `due_at` is null; always write `status`, `board`, `priority`, `vim-todo-id`).
4. Serialize fence + `buildObsidianMarkdown` body.

**Compare:**

```
cardBody  = normalize(buildObsidianMarkdown(note))
vaultBody = normalize(splitFence(vaultMd).body)
fieldsOk  = imported known fields (props, else body/footer) match note
conflict  iff cardBody !== vaultBody OR !fieldsOk
```

## Risks / Trade-offs

- **[Risk] Exotic YAML (multiline `|`, nested maps) fails to parse** → Mitigation: if the fence exists but a key cannot be parsed, keep that key’s raw block as an unknown passthrough string; never drop the fence.
- **[Risk] Next write adds Properties to every mapped file** → Mitigation: structured compare so that is not a conflict; users see the block in Obsidian after Open / keep-card. Acceptable; it is the sync surface.
- **[Risk] `due` in Properties is local-date in Obsidian and UTC in SQLite** → Mitigation: store/parse `YYYY-MM-DD` as UTC calendar date, same as `formatDueDateForObsidian` / `parseDueDateFromObsidian`.
- **[Risk] Board Property rename does not move the vault path** → Mitigation: out of scope; existing rename/remembered-path rules in the sibling sync change still apply when the *card* board changes.
- **[Trade-off] Footer tags stay even when `status` is in Properties** — duplicate, but lookup and older files keep working.

## Migration Plan

- No SQLite schema change. No settings flag.
- Existing vault files without Properties keep working; the next extension write adds the known-key fence.
- Import of files that already have Properties starts applying `due` / `status` / `board` / `priority` instead of stuffing YAML into the notes editor.
- Rollback: revert the util/service/modal changes; leftover Properties blocks in the vault remain valid Markdown.

## Open Questions

- None that block implementation. A later change can add in-app Properties editing if users want keys beyond the card fields.
