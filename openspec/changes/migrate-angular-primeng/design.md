# Design: Migrate to Angular + PrimeNG with compact JSON storage

## Context

**Current state:** vim-todo-list is a Chrome MV3 extension. The main UI is a self-contained IIFE in `popup.js` (~13k lines) that manipulates static HTML in `popup.html`, styled with custom CSS plus Carbon Design (`vendor/carbon.min.css`). Data lives in an embedded SQLite database via sql.js, serialized as Base64 under `chrome.storage.local` key `sqliteDb_v1`, with additional keys for theme, active board, keyboard layout, AI settings, etc. The popup runs inside an iframe injected by `overlay.js` on arbitrary pages; `background.js` handles Ollama proxying and install notifications. Features include boards, kanban columns, priorities, due dates, D3 calendar, rich notes, Obsidian vault sync (File System Access + IndexedDB handles), and local/AI autocompletion.

**Constraints:**

- MV3 CSP: `script-src 'self' 'wasm-unsafe-eval'` — Angular bundles must be same-origin extension assets; sql.js WASM must remain allowed.
- Overlay iframe: popup must postMessage theme/size/close events to parent (`overlay.js`); Angular app must preserve this contract.
- No backend: all persistence is local (`chrome.storage.local`, IndexedDB for vault handles).
- Chrome Web Store: avoid new broad permissions; keep existing permission set unless strictly required.
- User data: upgrades must migrate in place; Export DB / Import DB must remain compatible with pre-migration databases.

## Goals / Non-Goals

**Goals:**

- Scaffold **Angular (latest stable)** as the popup/overlay UI with standalone components, signals or RxJS state as appropriate, and lazy-loaded feature areas (notes, calendar, settings, instructions).
- Use **PrimeNG** for interactive UI primitives (Dialog, TabView/Tabs, InputText, Textarea, Select, DatePicker, Menu, Button, Toast, ConfirmDialog, DataView or custom card list, Tooltip, Sidebar for settings).
- **Feature parity** with README and existing OpenSpec capabilities (due dates, calendar, prioritization, link-style controls).
- **Compact JSON persistence**: single envelope object with short keys, `JSON.stringify` without whitespace, debounced writes; migrate legacy `*_v1` keys on first load.
- **Production build**: tree-shaken, minified bundles copied to extension root or `dist/extension/` with `manifest.json` pointing at built `popup.html`.
- Preserve **background.js**, **overlay.js**, Obsidian pick/grant pages until optionally migrated later.
- Preserve **keyboard navigation** (vim-inspired bindings, QWERTY/Dvorak layouts) via Angular `@HostListener` or dedicated `KeyboardService`.

**Non-Goals:**

- Rewriting `background.js` or `overlay.js` in Angular (unless trivial message typing is added).
- Replacing SQLite with a pure JSON document store (SQLite remains canonical for notes and Export DB).
- Changing Obsidian merge semantics or adding cloud sync.
- Redesigning visual identity beyond what PrimeNG theming + existing CSS tokens require for parity.
- Supporting non-Chromium browsers in this change.

## Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|-------------------------|
| **Angular app in `src/` with `@angular-builders/custom-webpack` or official application builder + post-build copy** | Standard Angular tooling; enables HMR during dev and minified prod output. | Vite+Analog, plain TypeScript modules — less structure for large UI. |
| **PrimeNG with Aura (or Lara) preset + custom CSS variables mapped to existing themes** | PrimeNG is actively maintained, rich component set, works with Angular standalone. | Keep Carbon, Angular Material, Spartan — Carbon being removed; Material less aligned with dense keyboard UI. |
| **Keep sql.js in a `DatabaseService` wrapper** | Preserves SQL schema, queries, Export DB binary fidelity. | JSON-only storage — loses SQL export and complex queries. |
| **Compact envelope key `vtd_v2` with short field map** | One read/write reduces storage API chatter; minified JSON cuts size vs. scattered pretty keys. | Keep separate `*_v1` keys — more round trips, larger metadata overhead. |
| **Migration on bootstrap: read legacy keys → write envelope → delete legacy keys after success** | Transparent upgrade for existing users. | Dual-write forever — complexity and drift risk. |
| **SQLite blob stored as Base64 inside envelope field `db` (or keep dedicated slot)** | Matches current model; envelope holds prefs (`t`, `b`, `kl`, etc.). | Store only JSON rows — breaking Export DB. |
| **PrimeNG `p-button` styled as link controls via `link` severity + monospace CSS** | Satisfies `popup-text-link-controls` spec without custom elements everywhere. | Raw `<button class="headerLink">` — forfeits PrimeNG consistency. |
| **Feature modules: core (db, storage, chrome), features (notes, calendar, settings, obsidian), shared (ui)** | Mirrors domain boundaries in current `popup.js`. | Single AppComponent — unmaintainable. |
| **D3 calendar in Angular component with `OnDestroy` cleanup** | Reuse proven calendar logic. | PrimeNG FullCalendar — different UX, heavier dependency. |
| **Ollama calls via `chrome.runtime.sendMessage` to background** | Already avoids mixed-content in iframe. | Direct fetch from Angular — breaks on HTTPS embed hosts. |
| **Dev: `ng build --watch` + load unpacked from `dist/extension`** | Fast iteration. | Edit root files directly — conflicts with Angular source model. |

### Compact JSON envelope (illustrative)

```json
{"v":2,"db":"<base64 sqlite>","t":"dark","b":"To Do","kl":"qwerty","ai":{"u":"http://localhost:11434","m":""}}
```

Field map documented in `StorageService`; unknown fields ignored on read for forward compatibility.

### PrimeNG component mapping (high level)

| Current UI | PrimeNG |
|------------|---------|
| Settings modal / add note modal | `p-dialog` |
| Board tabs | `p-tabs` |
| Theme / font selects | `p-select` |
| Due date picker | `p-datepicker` |
| Settings sections | `p-accordion` or `p-tabpanels` |
| Conflict / confirm flows | `p-confirmdialog` |
| Toasts / errors | `p-toast` |
| Card action menus | `p-button` link + `p-menu` popup where needed |
| Rich notes toolbar | PrimeNG `p-editor` or retained contenteditable wrapper if parity requires |

### Angular extension bootstrap

- `main.ts` bootstraps standalone `AppComponent` into `index.html` template emitted as extension `popup.html`.
- `ChromeStorageService` abstracts `chrome.storage.local` with envelope read/write.
- `OverlayBridgeService` posts `vim-todo-theme`, `vim-todo-popup-size`, `vim-todo-close` to `window.parent`.
- Routes or view state enum: `notes`, `calendar`, `instructions`, `about`, `settings` (match current header links).

## Risks / Trade-offs

- **[Risk] Bundle size exceeds current lazy-loaded perception** → Mitigation: lazy routes, production budgets, analyze bundle; defer D3 to calendar route only.
- **[Risk] PrimeNG default styling breaks link-style control spec** → Mitigation: global PrimeNG overrides in `styles.scss`; visual regression checklist.
- **[Risk] Keyboard shortcut regressions** → Mitigation: port binding table to typed config; manual test matrix from Instructions view.
- **[Risk] Obsidian FS API + IndexedDB from Angular zone** → Mitigation: keep obsidian helpers as injectable services ported from `popup.js`; test pick-vault flow unchanged.
- **[Risk] Migration corrupts storage** → Mitigation: write envelope only after successful legacy read; keep backup copy of legacy blob until verified load.
- **[Trade-off]** Dual maintenance during migration (old + new) if phased — prefer big-bang cutover behind thorough QA to avoid two UIs.
- **[Trade-off]** PrimeNG `p-editor` may differ from current rich-text behavior — may retain existing editor DOM logic wrapped in Angular component.

## Migration Plan

1. **Scaffold** Angular app + extension build script; manifest still loads old popup until cutover flag.
2. **Port services** (database, storage migration, chrome messaging) with unit tests for envelope round-trip.
3. **Port UI** view-by-view (notes → settings → calendar → instructions/about).
4. **Run migration** on dev profiles with real `sqliteDb_v1` exports; verify Export DB / Import DB round-trip.
5. **Cutover** `manifest.json` to built `popup.html`; remove `popup.js` and Carbon CSS from package.
6. **Rollback:** Ship previous release zip; envelope reader keeps backward compat if rollback reads only legacy keys (keep migration idempotent).

## Implementation notes (apply pass)

- **Load target:** Unpacked installs use `dist/extension/` produced by `npm run build:ext`.
- **Bundle size:** Production initial JS ~869 KB raw / ~190 KB transferred (Angular + PrimeNG + sql.js); notes/calendar/settings lazy-loaded.
- **Storage:** Envelope key `vtd_v2`; legacy `sqliteDb_v1` and related keys migrate on first bootstrap.
- **Legacy UI:** Root `popup.html` / `popup.js` retained for rollback reference; not included in `dist/extension` build output.
- **Obsidian / keyboard / tour:** Core Obsidian settings and vault picker wired; full vault sync/conflict UI and vim binding parity remain follow-ups against legacy `popup.js` behavior.

