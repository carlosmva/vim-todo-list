# Tasks: migrate-angular-primeng

## 1. Angular + extension scaffold

- [x] 1.1 Create Angular workspace under `src/` (latest stable) with standalone components and strict TypeScript
- [x] 1.2 Add Clarity (`@clr/ui`, `@clr/angular`, `@cds/core`); configure `clr-ui.min.css` in Angular styles (switched from PrimeNG — PrimeUI license required for PrimeNG v19+)
- [x] 1.3 Add extension build script: `ng build` production output copied to loadable extension directory with `popup.html`, assets, and hashed bundles
- [x] 1.4 Update `manifest.json` to point action/web-accessible resources at built popup; verify MV3 CSP with Angular bundles and sql.js WASM
- [x] 1.5 Add npm scripts (`build:ext`, `watch:ext`) and document Load unpacked flow in README

## 2. Core services (storage, database, chrome)

- [x] 2.1 Implement `ChromeStorageService` with compact envelope read/write (`vtd_v2`), minified `JSON.stringify`, and debounced persist
- [x] 2.2 Implement legacy migration: read `sqliteDb_v1`, `theme_v1`, `activeBoard_v1`, `keyLayout_v1`, AI keys → build envelope; verify idempotency
- [x] 2.3 Port sql.js bootstrap into `DatabaseService` (init, export bytes, import file, schema compatibility with existing DB)
- [x] 2.4 Implement `OverlayBridgeService` for `vim-todo-theme`, `vim-todo-popup-size`, `vim-todo-close` postMessage to parent
- [x] 2.5 Implement `BackgroundBridgeService` for Ollama probe/fetch via `chrome.runtime.sendMessage`
- [x] 2.6 Add unit tests for envelope serialize/deserialize and legacy migration fixtures

## 3. Clarity shell and shared UI

- [x] 3.1 Build `AppComponent` shell: header (title, theme select, Instructions/About links, tour, settings), view router/state
- [x] 3.2 Add global CSS overrides for link-style monospaced action controls (card actions, header links)
- [x] 3.3 Map theme ids to CSS variables for all six themes; sync overlay backdrop on theme change
- [x] 3.4 Use `window.confirm` / inline modals for delete confirm and import overwrite confirm (Clarity `clr-modal`)
- [x] 3.5 Remove Carbon CSS from migrated popup; confirm no `carbon-components` import in Angular build

## 4. Notes kanban feature (core parity)

- [x] 4.1 Implement board tabs with Clarity tabs; persist active board via envelope/SQLite
- [x] 4.2 Implement Pending/Complete columns with card list, priority ordering, drag-and-drop reorder, ↑/↓ controls
- [x] 4.3 Implement add-note flow (Clarity modal) with optional due date (native date input) per `note-due-dates` spec
- [x] 4.4 Implement card actions: Priority cycle, Links flip panel, Notes rich editor, Delete, Mark complete/Move to pending
- [x] 4.5 Port keyboard navigation service (QWERTY/Dvorak layouts, vim-style bindings) with `@HostListener` integration
- [ ] 4.6 Port autocompletion (local DB, custom words, Ollama) with Tab accept and arrow cycle behavior

## 5. Calendar, settings, and auxiliary views

- [x] 5.1 Port D3 calendar view into Angular component with lazy route; satisfy `calendar-view` spec scenarios
- [x] 5.2 Build Settings view (Clarity modal + tabs): AI, Obsidian, Keyboard, Data (export/import), appearance options
- [x] 5.3 Port Export DB, Import DB, Export CSV actions; verify binary SQLite and CSV formatting parity
- [x] 5.4 Port Instructions and About views with dynamic keyboard layout text
- [ ] 5.5 Port guided tour if present in current `popup.js`

## 6. Obsidian integration

- [ ] 6.1 Port Obsidian services (markdown build, path resolution, vault sync, conflict modal) into Angular injectables
- [x] 6.2 Wire pick-vault / grant-vault-access / IndexedDB handle flow unchanged; open Obsidian via background-safe URL launch
- [ ] 6.3 Implement Clarity conflict modal with side-by-side previews and keep-app/keep-vault/cancel outcomes
- [ ] 6.4 Verify Sync mode, first-open cache reset, and sync badges on cards

## 7. Cutover, cleanup, and verification

- [ ] 7.1 Run parity checklist against README features and existing specs (`note-due-dates`, `calendar-view`, `note-prioritization`, `popup-text-link-controls`)
- [ ] 7.2 Test upgrade path: load extension with legacy `*_v1` storage only; confirm notes/themes survive migration
- [ ] 7.3 Test overlay injection on HTTPS page (e.g. google.com): theme sync, close, Ollama probe, Obsidian open
- [ ] 7.4 Remove obsolete root `popup.js`, static `popup.html`, Carbon vendor CSS, and `carbon-components` dependency after cutover
- [x] 7.5 Measure popup load time and envelope size vs. legacy; document results in design.md implementation notes
- [ ] 7.6 Bump extension version and produce release zip via existing packaging approach
