## Context

This Chrome extension’s popup UI is implemented in `popup.html` + `popup.js`, with data persisted in a SQLite DB (sql.js) stored in `chrome.storage.local`.

The popup already supports:
- An in-app keyboard layout toggle (QWERTY/DVORAK) that changes navigation mappings.
- A dedicated in-app **Instructions** view whose content is rendered dynamically (so key labels match the active layout).
- Keyboard-first navigation via existing bindings (Alt+nav keys + Enter activation) across header controls, view controls, and per-card actions.

This change adds AI-backed autocomplete (optional, user-configured endpoint) and local DB-backed suggestions to the “New note…” input.

## Goals / Non-Goals

**Goals:**
- Add an **AI Settings** control in the header row (next to theme toggle) that opens a settings view.
- Persist an AI endpoint base URL (e.g., `http://localhost:11434`) in extension storage.
- Implement autocomplete in the main “New note…” input using:
  - Local DB task-name suggestions.
  - Word-level completion via the configured AI endpoint.
- Ensure configuration is accessible with the **existing** in-app key bindings in both QWERTY and DVORAK modes.
- Update the in-app **Instructions** view (and README, as needed) to include the new AI Settings control and any new autocomplete-specific keys.

**Non-Goals:**
- No mandatory AI dependency; the extension should remain fully usable with AI disabled.
- No cloud-hosted AI integration, account system, or telemetry.
- No attempt to implement a generic “works with every AI provider” protocol in the first pass.

## Decisions

1) **Settings storage**

- Store the AI endpoint as a base URL in `chrome.storage.local` (e.g., `aiEndpointBaseUrl_v1`).
- Treat an empty value as “AI disabled”.

*Alternatives considered*
- `chrome.storage.sync`: rejected initially to avoid cross-device propagation of localhost URLs and potential privacy surprises.

2) **Settings UI and view model**

- Add a new header control: `AI Settings` (same visual class as the other header links).
- Add a new view (parallel to existing `instructionsView`, `dashboardView`, `manageTabsView`):
  - `aiSettingsView` with a Close button and a single input for the endpoint base URL.
  - A Save action (either implicit on blur / Enter, or explicit Save button; keep minimal).

*Alternatives considered*
- Inline settings in the header: rejected to keep the header uncluttered and to match the existing “view” pattern.

3) **Keyboard accessibility (QWERTY + DVORAK)**

- Do **not** introduce a brand-new dedicated shortcut for opening AI Settings initially.
- Instead, ensure the AI Settings control is reachable through the existing navigation system:
  - Add it to the header link row so it participates in the current focus order.
  - Include it in the global navigation target list (`getGlobalNavTargets()`), alongside the existing header controls.
  - Use existing activation (`Enter`) to open the settings view.
- Ensure that when `aiSettingsView` is visible:
  - Global focus targets include the view’s Close button and primary input.
  - The “from header links, move down to primary control” behavior focuses the AI settings input.
- Update the in-app Instructions renderer to mention the new control and how to reach it using the existing key bindings; because the nav keys are layout-dependent, the instructions must be rendered dynamically like the other keys.

*Alternatives considered*
- Add `Alt+<key>` to open AI Settings directly: possible later, but adds key-selection complexity under QWERTY/DVORAK. The current navigation model already satisfies the requirement.

4) **Local DB suggestions**

- Use the existing SQLite DB to pull candidate task names for suggestions.
- Suggested query shape (exact schema details to be confirmed in implementation):
  - `SELECT DISTINCT text FROM notes WHERE text LIKE ? ORDER BY updated_at DESC LIMIT N`
- Suggestions should be fast and local; if there are no matches, fall back to AI only (if enabled).

*Alternatives considered*
- Full-text search: rejected for initial implementation complexity.

5) **AI endpoint integration**

- Store a *base URL* (e.g., `http://localhost:11434`) and treat the rest as an implementation detail.
- Implement a small adapter layer that builds the request URL(s) from the base URL.
  - For Ollama, this likely means calling a fixed endpoint under the base URL (e.g., `/api/generate`).
- Network failures must be non-fatal: if the endpoint is unreachable/invalid, autocomplete should degrade to local suggestions only.

*Alternatives considered*
- Storing a full endpoint path: more flexible, but increases user error; base URL is simpler and matches the request.

6) **Autocomplete UX (minimal)**

- Show a lightweight suggestion UI associated with the “New note…” input.
- Provide a single accept mechanism for word completion (e.g., `Tab` to accept), and document it in Instructions.
- Ensure normal form submission (`Enter` on Add button / form submit) remains unchanged.

## Risks / Trade-offs

- **[Endpoint permissions / CORS]** → Mitigation: add explicit host permissions for localhost endpoints as needed, keep scope narrow (localhost only) where feasible.
- **[Latency / UI jank]** → Mitigation: debounce AI calls; do local suggestions synchronously/quickly; cancel in-flight requests when input changes.
- **[Unexpected data leakage to endpoint]** → Mitigation: clearly treat AI as opt-in, only send what’s necessary (current input + minimal local context), and document behavior.
- **[Keybinding regressions]** → Mitigation: integrate AI Settings into the existing global focus navigation and update the in-app Instructions so users can discover it in both layouts.

## Migration Plan

- No DB schema changes.
- Add a new storage key for the AI endpoint base URL.
- If the key is missing, default to AI disabled.

## Open Questions

- What exact Ollama request/response contract should we support first (model selection, streaming vs non-streaming, endpoint path)?
- Should local suggestions and AI completions be merged into one list, or presented distinctly?
- What is the final acceptance key for applying an AI completion (Tab vs another key), and does it conflict with any existing navigation in practice?
