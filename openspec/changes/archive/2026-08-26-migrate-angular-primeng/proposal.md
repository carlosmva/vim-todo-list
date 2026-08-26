# Proposal: Migrate to Angular + PrimeNG with compact JSON storage

## Why

The extension UI and logic live in a single ~550 KB vanilla JavaScript file (`popup.js`) with hand-built DOM, Carbon CSS, and ad hoc state management. That makes the codebase hard to maintain, slow to load in the overlay iframe, and expensive to extend. Migrating to the latest Angular with PrimeNG gives a structured component model and a consistent UI toolkit, while a compact JSON persistence envelope reduces `chrome.storage.local` read/write size and parse time without changing user-visible behavior.

## What Changes

- Replace the monolithic `popup.html` / `popup.js` UI with an **Angular** application (latest stable) built for **Chrome Extension MV3** (popup + overlay iframe entry).
- Adopt **PrimeNG** for dialogs, inputs, tabs, menus, date pickers, data display, and other interactive controls; preserve existing keyboard-first workflows and accessibility semantics.
- Introduce a **compact JSON storage format** (short keys, no pretty-print, single envelope where practical) for extension settings and metadata persisted in `chrome.storage.local`, with **automatic migration** from current keys (`sqliteDb_v1`, `theme_v1`, etc.).
- Keep **sql.js / SQLite** as the canonical note database; Export DB / Import DB remain full-fidelity binary SQLite files.
- Preserve all current features: boards/tabs, Pending/Complete columns, priority, due dates, calendar view, links, rich notes, themes, AI autocompletion (Ollama), Obsidian sync, export/import (DB + CSV), keyboard layouts (QWERTY/Dvorak), overlay injection via content script, and background service worker behavior.
- Add an Angular **build pipeline** (production minification, tree-shaking) that outputs extension-loadable bundles under `dist/` and updates `manifest.json` entry points.
- Remove dependency on **carbon-components** once PrimeNG equivalents are in place; retire legacy static markup in root `popup.html` after cutover.

## Capabilities

### New Capabilities

- `angular-extension-shell`: Angular MV3 extension architecture—project layout, bootstrap, routing/views, overlay iframe integration, content-script messaging, and build output wired into `manifest.json`.
- `primeng-ui-layer`: PrimeNG component usage, theming, and styling rules so the migrated UI matches existing interaction patterns (link-style action controls, themes, responsive popup sizes).
- `compact-json-persistence`: Compact JSON envelope for `chrome.storage.local` with migration from legacy keys, minified serialization, and unchanged Export DB / Import DB semantics.

### Modified Capabilities

- *(none)* — Existing specs (`calendar-view`, `note-due-dates`, `note-prioritization`, `popup-text-link-controls`) describe user-facing behavior that this migration preserves. Implementation moves to Angular/PrimeNG; requirements are validated via regression, not spec edits.

## Impact

- **Code:** Replace or supersede `popup.html`, `popup.js`, `popup.css` (partial), Carbon vendor CSS; add `src/` Angular app, Angular build config, and extension asset copy step. Update `manifest.json` action/default popup and web-accessible resources. Keep `background.js`, `overlay.js`, Obsidian helper pages, and sql.js vendor scripts (or relocate under `src/assets`).
- **Dependencies:** Add `@angular/*`, `primeng`, `primeicons`, Angular CLI/build tooling; remove `carbon-components` when UI is fully migrated. Retain `sql.js`, `d3` (calendar), `sharp` (icons script).
- **Storage:** New compact JSON keys alongside one-time migration from `*_v1` keys; SQLite blob remains inside envelope or dedicated slot—no user data loss on upgrade.
- **Performance:** Smaller initial JS payload via production builds; faster storage sync via compact JSON; WASM sql.js load unchanged.
- **Risk:** Large rewrite surface—regression risk across Obsidian sync, vim-style keyboard bindings, and overlay CSP. Mitigate with phased migration, parity checklist against README features, and keeping background/content scripts stable initially.
