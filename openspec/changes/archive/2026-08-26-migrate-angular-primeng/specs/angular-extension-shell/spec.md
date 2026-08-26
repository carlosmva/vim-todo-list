# angular-extension-shell Specification

## Purpose

Define how the vim-todo-list Chrome extension hosts an Angular application as its primary UI while preserving MV3 constraints, overlay iframe behavior, and integration with existing background and content scripts.

## ADDED Requirements

### Requirement: Extension popup loads an Angular bootstrap bundle

The system SHALL serve the main extension UI from an Angular-built `popup.html` and associated JavaScript bundles listed in `manifest.json` as extension-local assets (`script-src 'self'`).

#### Scenario: User opens the extension popup

- **WHEN** the user clicks the extension action or uses the configured keyboard shortcut
- **THEN** the overlay or action popup loads the Angular application without remote script dependencies

#### Scenario: Production build is minified

- **WHEN** a production build is produced for release
- **THEN** JavaScript bundles are minified and tree-shaken per Angular production defaults

### Requirement: Angular app preserves overlay postMessage contract

When the Angular app runs inside the overlay iframe injected by `overlay.js`, it SHALL communicate with the parent using the existing message types: `vim-todo-theme`, `vim-todo-popup-size`, and `vim-todo-close`.

#### Scenario: Theme change updates overlay backdrop

- **WHEN** the user changes theme in the Angular app
- **THEN** the app posts `vim-todo-theme` with the theme id to `window.parent`

#### Scenario: Close action dismisses overlay

- **WHEN** the user closes the popup from the Angular UI
- **THEN** the app posts `vim-todo-close` so the content script removes the overlay

### Requirement: sql.js WASM remains usable under extension CSP

The Angular application SHALL load sql.js and its WASM from extension-local paths allowed by the manifest content security policy (`wasm-unsafe-eval` as required).

#### Scenario: Database initializes on first open

- **WHEN** the Angular app bootstraps
- **THEN** the embedded SQLite database initializes successfully using sql.js without CSP violations

### Requirement: Background service worker integration is unchanged

The Angular app SHALL use `chrome.runtime.sendMessage` (or equivalent extension APIs) for operations currently delegated to `background.js`, including Ollama fetch/probe, without requiring new host permissions beyond the existing manifest.

#### Scenario: Ollama health check from embedded popup

- **WHEN** the user configures an Ollama endpoint in Settings
- **THEN** health checks succeed via the background service worker when the popup runs on an HTTPS page inside the overlay iframe

### Requirement: Feature views match pre-migration navigation

The Angular shell SHALL expose the same primary views as today: notes (default), calendar, instructions, about, and settings, reachable from the header without losing browser history semantics inside the popup.

#### Scenario: Header navigation switches views

- **WHEN** the user activates Calendar or Instructions from the header
- **THEN** the Angular app displays the corresponding view and hides the notes kanban

#### Scenario: Default view is notes

- **WHEN** the popup opens fresh
- **THEN** the notes kanban view is shown

### Requirement: Extension build output is loadable as unpacked extension

The repository SHALL provide a documented build command that emits all assets required by `manifest.json` (popup, icons, background, content scripts, sql.js vendor files) into a loadable directory for Chrome “Load unpacked.”

#### Scenario: Developer loads built extension

- **WHEN** the developer runs the documented build and loads the output folder in `chrome://extensions`
- **THEN** the extension activates without manual copying of individual files beyond the build step
