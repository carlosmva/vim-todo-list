## 1. Vim Mode + State Plumbing

- [x] 1.1 Extend Vim mode state to include `visual` (update `vimSetMode` / `vimGetMode` / indicator rendering)
- [x] 1.2 Add per-note visual selection anchor storage (e.g., `vimVisualAnchorByNoteId`) and clear it on mode exits
- [x] 1.3 Ensure pending-sequence state is cleared appropriately when switching modes (normal ↔ visual ↔ insert)

## 2. Visual Mode Selection Behavior

- [x] 2.1 Implement `v` in normal mode to enter visual mode and establish an anchor at the current caret
- [x] 2.2 Implement `Esc` in visual mode to exit to normal mode and collapse selection to a caret
- [x] 2.3 Update movement handling so in visual mode `h/j/k/l` extends selection (use `Selection.modify('extend', ...)`)
- [x] 2.4 Support visual-mode extension for line navigation keys already supported in normal mode (`0`, `^`, `$`, `gg`, `G`) or explicitly constrain to `h/j/k/l` if necessary

## 3. Registers (“Memory Banks”)

- [x] 3.1 Refactor register storage from a single register to a small register bank per note (default + a small set like `1`–`4`)
- [x] 3.2 Add a minimal register selection prefix (e.g., `"` then `1`–`4`) for the next yank/paste command
- [x] 3.3 Define and implement default register behavior when no named register is selected

## 4. Yank and Paste

- [x] 4.1 Implement yank of visual selection (`y` in visual mode) into the selected register (capture both text and HTML when possible)
- [x] 4.2 Ensure yank exits visual mode back to normal mode after completing
- [x] 4.3 Implement paste from the selected register at the caret (prefer HTML insertion, fallback to text)
- [x] 4.4 Decide and implement whether paste switches to insert mode (per design: switch to insert after paste)

## 5. Instructions Updates

- [x] 5.1 Update in-app Instructions rendering to document: enter visual mode (`v`), exit (`Esc`), yank (`y`), paste (`p`), and register selection syntax
- [x] 5.2 Verify Instructions still render layout-dependent navigation keys correctly for both QWERTY and DVORAK

## 6. Validation / Manual Testing

- [ ] 6.1 Manually validate visual selection across typical note content (plain text, multiple blocks, lists)
- [ ] 6.2 Manually validate yank/paste for default and named registers, including formatting preservation where feasible
- [ ] 6.3 Confirm no regressions to existing normal-mode commands (`dd`, `yy`, `p`, `:x`, `Esc` behavior)
