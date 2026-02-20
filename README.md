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
- **AI autocompletion (Ollama)**: optional word/phrase suggestions powered by a local LLM
  - Configure via **AI Settings** in the header (endpoint URL, model name)
  - Works alongside local completions (DB, custom words, dictionary)
  - Press `Tab` to accept a suggestion; use arrow keys to cycle through options

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
- **AI Settings** is available in the header links row (configure an optional local AI endpoint like Ollama).
- When a word-completion suggestion is shown while typing a new note, press `Tab` to accept it.

## AI autocompletion (Ollama)

The extension can use [Ollama](https://ollama.ai) running locally to suggest completions as you type. Completions are contextual and can span words or phrases.

1. **Install Ollama** on your machine and pull a model (e.g. `ollama pull llama3.2`).
2. Open **AI Settings** from the header and configure:
   - **Endpoint base URL**: `http://localhost:11434` (Ollama default)
   - **Model name** (optional): e.g. `llama3.2:latest` — leave blank to use your default Ollama model
3. Save. The status LED indicates when the endpoint is reachable.
4. While typing in the **New note** input or **Notes** editor, AI suggestions appear alongside local completions. Press `Tab` to accept; use arrow keys to cycle through options.

**Troubleshooting**

- If the status LED stays on "checking", ensure Ollama is running and reachable at your configured URL.
- On **403 errors**, Ollama blocks cross-origin requests by default. Allow extension origins and restart Ollama:
  - Windows: `setx OLLAMA_ORIGINS "chrome-extension://*"`
  - macOS/Linux: `export OLLAMA_ORIGINS="chrome-extension://*"`

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
