# vim-todo-list

Chrome extension for fast, keyboard-first task notes stored locally in an embedded SQLite database (sql.js/WebAssembly). Opens as a centered overlay with backdrop blur over the current page (click the extension icon, or assign `Alt+R` / `Ctrl+R` on Mac in `chrome://extensions/shortcuts`).

![Vim To-Do List logo](icons/logo1024x1024.png)

Also available in chrome webstore https://chromewebstore.google.com/detail/vim-todo-list/ofanmcblejkboimkfachgfgimfencdmd

## What's new in 1.3.1

- **Focus Mode**: press `f` on a pending task to work one item at a time; Esc returns to the board.
- First-run **guided tour**, with replay from **Settings → Keyboard** or the header pin.
- AI add-note suggestions no longer leak prompt markup into the completion.

## What's new in 1.3.0

- Angular-based popup with responsive **medium**, **large**, and **full-screen** sizes.
- Restored Dashboard activity heatmaps, board filters, and responsive Calendar views for the current and next month.
- Bidirectional lazy loading keeps large Pending and Complete lists navigable without rendering every card at once.
- Improved keyboard navigation across Notes, Calendar, Dashboard, Settings, and the add-note dialog.
- Click a Calendar task to return to Notes with that card focused; click a card due date to edit it inline.
- Optional Obsidian vault integration creates missing Markdown files, opens mapped notes, and asks which version to keep when a vault file conflicts with a card.
- AI completion is available in both the task-name field and the rich Notes editor when Ollama is configured.
- Database import/export includes appearance, popup size, keyboard layout, AI, and Obsidian settings; older databases safely receive missing defaults.

## Features

- Two columns per board: **Pending** and **Complete**
- Multiple **boards** via tabs
- Per-card actions row: **Priority**, **Links**, **Notes**, **Delete**, **Mark complete / Move to pending**
- **Reorder cards**: ↑/↓ buttons or drag-and-drop to move cards up or down within Pending or Complete
- Priority levels: `low`, `normal`, `high`
  - Text colors: low = black, normal = blue, high = red
  - Cards are always ordered by priority (high → normal → low)
- Export/Import
  - **Export DB** / **Import DB** for full fidelity
  - **Export CSV** with readable values (dates as `MM/DD/YYYY`, `notes_html` exported as readable text)
- **AI autocompletion (Ollama)**: optional word/phrase suggestions powered by a local LLM
  - Configure via **AI** in the header (endpoint URL, model name)
  - Works alongside local completions (DB, custom words, dictionary)
  - Press `Tab` to accept a suggestion; use arrow keys to cycle through options
- **Guided tour**: runs on first open and can be replayed from **Settings → Keyboard** or the header pin
- **Obsidian (optional)**: link the extension to a vault folder, sync Markdown with your notes, open notes in Obsidian, and resolve conflicts when vault files and cards disagree (see below)

## Obsidian integration

Configure everything under **Settings** (gear) → **Obsidian**.

- **Vault name** — Must match the vault name shown in Obsidian (lower-left). **Notes folder** is optional (path under the vault root where `.md` files are stored).
- **Choose vault folder** — Uses Chromium’s **File System Access API** so the extension can read and write Markdown under your real vault directory. Granting access turns on **Sync mode** (read/write vault files, not `obsidian://` alone).
- **Sync mode** — Keeps the app’s note data and vault `.md` files in sync: writes the built Markdown to disk, compares normalized content and timestamps before merging, and flushes any open rich-text editor draft to SQLite before comparing with the file.
- **Per-card Obsidian** — Each card has an **Obsidian** control to create or open the mapped note. Files follow a predictable path (board folder, title slug, optional id suffix when titles collide). The first successful create can use `obsidian://new`; after that, opens use **`obsidian://open` only** so Obsidian does not spawn numbered duplicate notes when updating.
- **Conflict resolution** — If the vault file and the extension disagree and the merge is ambiguous, a **Resolve conflict** modal shows side-by-side previews (**This card** vs **Vault file on disk**). You choose which side to keep or cancel; nothing is overwritten silently.
- **Sync badges** — When Obsidian is configured, cards can show a small status (e.g. in sync, diverged, or warning) so you can see vault vs app state at a glance.
- **Clear first-open cache** — In Obsidian settings, clears remembered “path already created” state. Use if creation failed or you deleted the file in Obsidian and need create semantics again on the next open.
- **Opening Obsidian** — `obsidian://` URLs are opened in a way that works when the popup runs inside strict embedders (e.g. new tab via the extension API instead of relying on frame navigation alone).

## Install (unpacked)

1. Install dependencies:
   - `npm install`
   - `npm install --prefix src`
2. Build the Angular extension UI and vendor assets:
   - `npm run build:ext` (from the repo root, or `npm run build:ext` from `src/`)
3. Load the extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the **`dist/extension`** folder (not the repo root)

For development with auto-rebuild:

- `npm run watch:ext` — rebuilds Angular on file changes; reload the extension in Chrome after each build.

## Architecture (v1.3+)

- **Angular 22** + **VMware Clarity** (`@clr/angular`) popup UI under `src/` (MIT, no license key required)
- **Compact JSON** storage envelope (`vtd_v2` in `chrome.storage.local`) with automatic migration from legacy `*_v1` keys
- **sql.js** SQLite remains the canonical note store; Export DB / Import DB unchanged
- Load unpacked builds from **`dist/extension/`** after `npm run build:ext`

## Usage

- Type a note in **New note** and click **Add**.
- Use **Mark complete** / **Move to pending** to move cards between columns.
- Use **↑** / **↓** or drag-and-drop to reorder cards within Pending or Complete.
- Use **Links** to flip the card and manage saved URLs.
- Use **Notes** to open the rich notes editor for that card.
- Use **Priority** to cycle `normal → high → low → normal`.
- A **guided tour** starts on first open. Replay it from **Settings → Keyboard** or the header pin.

## Themes

- **Light** and **Dark** (default)
- **Solarized Light** and **Solarized Dark**
- **Emacs** (classic light gray)
- **Command Line** (terminal-style: black background, green text, monospace)
- Click the theme button in the header to cycle through options.
- Theme preference is stored in the DB and travels with Export DB / Import DB.

## Keyboard

- Open popup: assign `Alt+R` (Windows/Linux) or `Ctrl+R` (Mac) in `chrome://extensions/shortcuts` (Chrome often leaves the suggested key unassigned). You can also click the toolbar icon.
- The popup also includes an in-app **Instructions** view with the full, up-to-date keybindings.
- **Settings** → **Keyboard** chooses **QWERTY** or **Dvorak** mappings (the in-app Instructions update to match).
- Replay the guided tour from **Settings → Keyboard** or the header pin; it also runs automatically on first open.
- Press **f** on a pending task to enter Focus Mode (one task, a today counter, and a timer). **Esc** returns to the board.
- **Tabs** and **About** are in the header links row; **Settings** (gear) holds AI, Obsidian, and keyboard options.
- When a word-completion suggestion is shown while typing a new note, press `Tab` to accept it.

## AI autocompletion (Ollama)

The extension can use [Ollama](https://ollama.ai) running locally to suggest completions as you type. Completions are contextual and can span words or phrases.

1. **Install Ollama** on your machine and pull a model (e.g. `ollama pull llama3.2`).
2. Open **Settings** (gear) → **AI** and configure:
   - **Endpoint base URL**: `http://localhost:11434` (Ollama default)
   - **Model name** (optional): e.g. `llama3.2:latest` — leave blank to use your default Ollama model
3. Save. The status LED indicates when the endpoint is reachable.
4. While typing in the **New note** input or **Notes** editor, AI suggestions appear alongside local completions. Press `Tab` to accept; use arrow keys to cycle through options.

**Troubleshooting**

- If the status LED stays on "checking", ensure Ollama is running and reachable at your configured URL.
- On **CORS / 403 errors**, Ollama blocks extension origins by default. Set OLLAMA_ORIGINS on the **machine running Ollama** (local or remote), then **fully restart** Ollama:
  - **Linux (systemd)**: Run `sudo systemctl edit ollama`, add under `[Service]`:
    ```ini
    Environment="OLLAMA_ORIGINS=chrome-extension://*"
    ```
    Then run `sudo systemctl daemon-reload && sudo systemctl restart ollama`. Verify with `systemctl show ollama --property=Environment`.
  - **Windows**: `setx OLLAMA_ORIGINS "chrome-extension://*"` then quit and restart Ollama
  - **macOS**: `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart Ollama
  - If that fails, test with `OLLAMA_ORIGINS=*` to allow all origins

## Notes Editor Shortcuts

- **Toggle crossed-out (strikethrough) text for the line:**
   - QWERTY: <kbd>Alt</kbd>+<kbd>H</kbd> (Windows/Linux) or <kbd>Ctrl</kbd>+<kbd>H</kbd> (Mac)
   - DVORAK: <kbd>Alt</kbd>+<kbd>D</kbd> (Windows/Linux) or <kbd>Ctrl</kbd>+<kbd>D</kbd> (Mac)
- Other navigation and editing shortcuts are shown in the in-app Instructions view.

## Data storage

- Notes are stored in a SQLite DB (sql.js) persisted in `chrome.storage.local`.
- DB bytes are stored as Base64 under `sqliteDb_v1`.
- Theme and AI settings are stored in the DB and travel with Export DB / Import DB.

## About

**vim-todo-list** by [Northeastern Software Services LLC](https://northeasternsoftware.com/)

- [GitHub](https://github.com/carlosmva/vim-todo-list)

## Development notes

- `vendor/` contains runtime assets used by the popup (e.g. `sql-wasm.js`, CSS) and is intentionally kept in the repo.
- Icon generation scripts live in `scripts/`.
