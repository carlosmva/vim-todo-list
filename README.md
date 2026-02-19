# vim-todo-list

Chrome extension popup for fast, keyboard-first task notes stored locally in an embedded SQLite database (sql.js/WebAssembly).

Also available in chrome webstore https://chromewebstore.google.com/detail/vim-todo-list/ofanmcblejkboimkfachgfgimfencdmd

## Features

- Two columns per board: **Pending** and **Complete**
- Multiple **boards** via tabs
- Per-card actions row: **Priority**, **Attachments**, **Notes**, **Delete**, **Mark complete / Move to pending**
- Priority levels: `low`, `normal`, `high`
  - Text colors: low = black, normal = blue, high = red
  - Cards are always ordered by priority (high → normal → low)
- Export/Import
  - **Export DB** / **Import DB** for full fidelity
  - **Export CSV** with readable values (dates as `MM/DD/YYYY`, `notes_html` exported as readable text)

## Install (unpacked)

1. Install dependencies:
   - `npm install`
2. Ensure the sql.js vendor files are present:
   - `npm run vendor`
3. Load the extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this folder

## Usage

- Type a note in **New note** and click **Add**.
- Use **Mark complete** / **Move to pending** to move cards between columns.
- Use **Attachments** to flip the card and manage links.
- Use **Notes** to open the rich notes editor for that card.
- Use **Priority** to cycle `normal → high → low → normal`.

## Keyboard

- Open popup: `Alt+R` (same shortcut regardless of in-app QWERTY/DVORAK mode)
- The popup also includes an in-app **Instructions** view with the full, up-to-date keybindings.
- A **keyboard layout toggle** in the header switches between QWERTY and DVORAK mappings (and updates the in-app instructions accordingly).

## Notes Editor Shortcuts

- **Toggle crossed-out (strikethrough) text for the line:**
   - QWERTY: <kbd>Alt</kbd>+<kbd>H</kbd>
   - DVORAK: <kbd>Alt</kbd>+<kbd>D</kbd>
- Other navigation and editing shortcuts are shown in the in-app Instructions view.

## Data storage

- Notes are stored in a SQLite DB (sql.js) persisted in `chrome.storage.local`.
- DB bytes are stored as Base64 under `sqliteDb_v1`.

## Development notes

- `vendor/` contains runtime assets used by the popup (e.g. `sql-wasm.js`, CSS) and is intentionally kept in the repo.
- Icon generation scripts live in `scripts/`.
