## Context

The extension popup UI is implemented in `popup.html` + `popup.js`, with a rich (contenteditable) per-card Notes editor.

The Notes editor already includes a lightweight Vim-style state machine:
- Modes are tracked per note via `vimModeByNoteId` with `insert` (default) and `normal`.
- In `normal` mode, keypresses are treated as commands (movement via `h/j/k/l`, block ops like `dd` / `yy`, and paste-after-block via `p`).
- A small “pending” state machine (`vimPendingByNoteId`) supports multi-key sequences (e.g., `gg`, `dd`, `yy`, `:x`).

This change adds a minimal Visual-style selection mode within the Notes editor plus yank/paste of the selected range into a small set of registers (“memory banks”).

## Goals / Non-Goals

**Goals:**
- Add a `visual` mode to the Notes editor Vim state machine, entered from `normal` mode.
- While in `visual` mode, use the existing movement commands to *extend* a selection range instead of moving a collapsed caret.
- Add yank/copy of the selected range into a register.
- Add paste from a register at the caret (insertion into the editor content), keeping behavior keyboard-first.
- Update the in-app Instructions so users can discover the new bindings (QWERTY/DVORAK instructions rendering must remain correct).

**Non-Goals:**
- Full Vim feature set (text objects, operators + motions, visual line/block modes).
- Persisting registers across popup reloads (initially registers are in-memory).
- Cross-editor clipboard integration beyond what the browser already provides.

## Decisions

1) **Represent Visual mode as an explicit Vim mode**

- Extend the mode domain from `{insert, normal}` to `{insert, normal, visual}`.
- Update the existing indicator logic to display `VISUAL` when active.

*Alternatives considered*
- “Implicit visual” via the browser selection only: rejected because we need deterministic entry/exit semantics and a clear state machine for yank/paste/registers.

2) **Track the visual selection anchor per note**

- Maintain `vimVisualAnchorByNoteId: Map<noteId, Range>` (or equivalent) to store the anchor when entering `visual` mode.
- On entering `visual` mode:
  - If there is no selection (collapsed caret), store a clone of the current caret range as the anchor.
  - If a selection exists, treat the current `Selection` start as the anchor and normalize the selection to the editor.
- On leaving `visual` mode:
  - Clear the anchor and collapse selection to the active end (typically the caret end).

*Alternatives considered*
- Derive anchor implicitly from `Selection.anchorNode/anchorOffset`: rejected; browser behavior can shift anchor/focus during DOM edits, and we need predictable selection behavior.

3) **Use `Selection.modify()` to extend selection with existing motion keys**

- Reuse the existing movement primitives but switch from `sel.modify("move", ...)` to `sel.modify("extend", ...)` while in `visual` mode.
- In `visual` mode:
  - `h/l` extend by character
  - `j/k` extend by line
  - `0`, `^`, `$`, `gg`, `G` extend to the same targets as current `normal` mode navigation (using existing helpers like `vimCaretToStartOfLine` / `vimCaretToEndOfLine` and selection range adjustments).

*Alternatives considered*
- Manual DOM + Range math for all motions: rejected for initial complexity; `Selection.modify()` is already used for movement, and Chrome supports it.

4) **Registers (“memory banks”) as a per-note map**

- Replace the current single-register storage (`vimRegisterByNoteId.set(noteId, { html, text })`) with a structured register bank:
  - `vimRegistersByNoteId: Map<noteId, Map<registerName, { html?: string, text?: string }>>`
  - Always include an unnamed/default register (e.g., `"` or `0`).
  - Provide a small fixed set of named registers (initially: `1`–`4`).

*Alternatives considered*
- Global registers across all notes: rejected; it increases surprise when editing multiple notes and is harder to reason about.
- Persist registers to storage: rejected initially; it adds storage/migration concerns and increases the chance of confusing stale content.

5) **Register selection syntax: minimal and Vim-like**

- Support an optional register prefix using a lightweight pending state:
  - `"` then `[1-4]` selects a register for the next yank/paste command.
- Commands:
  - In `visual` mode: `y` yanks current selection to the selected register (or unnamed if none), then exits to `normal`.
  - In `normal` mode: keep existing `yy` behavior for “yank current block” to the unnamed register (or selected register if prefixed).
  - `p` pastes the selected register at the caret as an insertion and then switches to `insert` mode (so the user can continue typing immediately).

*Alternatives considered*
- Use `1y` / `1p` directly without `"`: rejected to avoid colliding with future count prefixes and to keep parsing unambiguous.

6) **Yank and paste preserve formatting when feasible**

- When yanking a selection, capture both:
  - `text`: `Range.toString()`
  - `html`: serialize `Range.cloneContents()` into a string (wrapper element → `innerHTML`)
- When pasting:
  - Prefer inserting `html` (via `document.execCommand('insertHTML', ...)` or Range insertion) to preserve formatting.
  - Fallback to `insertText` if HTML insertion fails or HTML is absent.

*Alternatives considered*
- Text-only registers: simpler, but would unexpectedly drop formatting in a rich editor.

## Risks / Trade-offs

- **[Selection API quirks across DOM boundaries]** → Mitigation: clamp selections to within `.noteEditorArea`; if selection becomes invalid, collapse to a safe caret position in the editor.
- **[Deprecated `execCommand` behavior differences]** → Mitigation: keep existing usage (already used elsewhere) and provide a Range-based fallback for paste.
- **[Conflicts with existing normal-mode behavior]** → Mitigation: keep current `normal` bindings intact; add `visual` as an additive mode with explicit entry/exit and careful pending-state clearing.
- **[User confusion about QWERTY/DVORAK]** → Mitigation: update Instructions to clearly describe the new commands and how they relate to the active layout toggle.

## Migration Plan

- No DB schema changes.
- No new storage keys required for the initial in-memory register bank.

## Open Questions

- How many registers should we expose initially (e.g., `1`–`4` vs `a`–`d`), and should we include an explicit “unnamed” register in documentation?
- Should paste in `visual` mode replace the current selection (Vim-like) or always insert at caret? (Proposal asks for “paste at caret”; replacing is optional and can be deferred.)
- Do we want to extend the movement set in visual mode beyond `h/j/k/l` (e.g., word motions), or keep it minimal for the first iteration?
