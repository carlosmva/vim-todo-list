# vim-todo-list (Chrome extension + SQLite)

A minimal Chrome Extension (Manifest V3) that stores notes in a SQLite database (via `sql.js` / WebAssembly) and persists the DB in `chrome.storage.local`.

UI styling is provided by IBM Carbon (CSS) vendored locally.

## Setup

1. Install dependencies (pulls `sql.js`):
   - `npm install`

2. Copy sql.js build artifacts into `vendor/`:
   - `npm run vendor`

3. Load unpacked extension in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select this folder

## Usage

- Add a note in the input.
- Click **Mark complete** / **Move to pending** to move it between columns.
- Use the tabs (eQuotes, Signatures, KO, Approvals, Alignments, Tools) as separate boards.
- Click **Attachments** on a card to flip to the back, and **Back** to return.
- Add links with a **description** + **URL**; the list shows the description and links to the URL.
- Use **Delete** to remove a saved link.

## Persistence

- The SQLite database is exported as bytes and stored as Base64 under the key `sqliteDb_v1` in `chrome.storage.local`.
