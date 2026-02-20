## Why

Editing notes is already Vim-style (normal/insert), but there is no fast way to select text and move/copy it without the mouse. Adding a minimal Visual-style selection plus yank/paste (with simple “memory bank” registers) makes the rich notes editor faster for power users while staying optional and keyboard-first.

## What Changes

- Add a Visual-style selection mode in the per-card Notes editor, entered from Vim normal mode.
- Add yank/copy of the selected range into a “memory bank” register.
- Add paste from a register at the caret (insert mode insertion) in the Notes editor.
- Update in-app Instructions to document the new keybindings for both QWERTY and DVORAK layouts.

## Capabilities

### New Capabilities
- `vim-visual-copy-paste`: Visual selection in the Notes editor with yank/paste support and a small set of registers (“memory banks”).

### Modified Capabilities
- (none)

## Impact

- UI/UX: Notes editor keyboard handling and mode/state machine in the popup.
- Code: `popup.js` (Notes editor Vim logic, selection/range handling, register storage).
- Docs: in-app Instructions rendering (QWERTY/DVORAK) and README guidance if needed.
