## ADDED Requirements

### Requirement: Visual mode can be entered and exited
The system MUST support a Visual-style selection mode in the per-note Notes editor.

#### Scenario: Enter visual mode from normal mode
- **WHEN** the Notes editor is focused and in Vim normal mode and the user presses `v`
- **THEN** the editor enters Vim visual mode
- **AND THEN** the UI indicates the mode as `VISUAL`

#### Scenario: Exit visual mode back to normal mode
- **WHEN** the Notes editor is focused and in Vim visual mode and the user presses `Esc`
- **THEN** the editor exits visual mode back to normal mode
- **AND THEN** any active selection is collapsed to a caret position within the editor

### Requirement: Visual mode extends a selection using movement keys
While in Vim visual mode, movement commands MUST extend the active selection range (rather than only moving a collapsed caret).

#### Scenario: Extend selection by character
- **WHEN** the Notes editor is in Vim visual mode and the user presses `h` or `l`
- **THEN** the selection range is extended by one character backward (`h`) or forward (`l`)

#### Scenario: Extend selection by line
- **WHEN** the Notes editor is in Vim visual mode and the user presses `j` or `k`
- **THEN** the selection range is extended by one line forward (`j`) or backward (`k`)

### Requirement: Visual selection can be yanked into a register
The system MUST allow yanking the currently selected range while in Vim visual mode into a register (“memory bank”).

#### Scenario: Yank selection to default register
- **WHEN** the Notes editor is in Vim visual mode with a non-empty selection and the user presses `y`
- **THEN** the selected content is copied into the default register
- **AND THEN** the editor exits visual mode back to normal mode

#### Scenario: Yank selection to a named register
- **WHEN** the Notes editor is in Vim visual mode with a non-empty selection and the user selects a register (memory bank) and then presses `y`
- **THEN** the selected content is copied into the selected register
- **AND THEN** the editor exits visual mode back to normal mode

### Requirement: Pasting from a register inserts at the caret
The system MUST allow pasting from a register at the caret in the Notes editor.

#### Scenario: Paste from default register
- **WHEN** the Notes editor is focused and the user invokes paste from the default register
- **THEN** the register content is inserted at the caret position

#### Scenario: Paste from a named register
- **WHEN** the Notes editor is focused and the user selects a register (memory bank) and then invokes paste
- **THEN** the selected register content is inserted at the caret position

### Requirement: In-app instructions document the new keybindings
The in-app Instructions view MUST document the visual mode and yank/paste keybindings and MUST render the layout-dependent navigation keys correctly for both QWERTY and DVORAK.

#### Scenario: Instructions show visual mode keybindings
- **WHEN** the user opens the in-app Instructions view
- **THEN** the Instructions include how to enter and exit visual mode and how to yank and paste using registers
