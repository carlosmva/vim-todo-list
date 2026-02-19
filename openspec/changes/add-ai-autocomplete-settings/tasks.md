## 1. Storage + Settings plumbing

- [x] 1.1 Add storage key for AI endpoint base URL (e.g., `aiEndpointBaseUrl_v1`)
- [x] 1.2 Implement `loadAiEndpointBaseUrl()` and `saveAiEndpointBaseUrl()` helpers using `chrome.storage.local`
- [x] 1.3 Define “AI disabled” behavior when endpoint is missing/empty

## 2. AI Settings UI (header + view)

- [x] 2.1 Add an **AI Settings** control to the header row in the popup UI (next to theme toggle)
- [x] 2.2 Add a new view container (e.g., `aiSettingsView`) with Close button and endpoint URL input
- [x] 2.3 Wire open/close logic for the AI Settings view (match existing view patterns)
- [x] 2.4 Implement Save behavior for the endpoint URL and basic validation/normalization (trim, allow http/https)

## 3. Keyboard accessibility (QWERTY + DVORAK)

- [x] 3.1 Add the AI Settings control to the global nav target list so it’s reachable using existing navigation keys in both layouts
- [x] 3.2 Ensure focus behavior from the header row “down” action enters AI Settings view primary control when visible
- [x] 3.3 Ensure AI Settings view is fully operable by keyboard (focus endpoint input, close via existing mechanisms)

## 4. In-app Instructions + README updates

- [x] 4.1 Update `renderInstructions()` to mention the AI Settings control and how to access it via existing navigation
- [x] 4.2 Add documented autocomplete behavior and acceptance key(s) in the in-app Instructions
- [x] 4.3 Verify instructions content updates correctly when toggling QWERTY/DVORAK layout
- [x] 4.4 Update README keyboard/instructions section to mention AI Settings + autocomplete (keep consistent with in-app instructions)

## 5. Local DB suggestions for new note input

- [x] 5.1 Add a query/helper to fetch suggestion candidates from the local SQLite DB (distinct note texts; limited; ordered sensibly)
- [x] 5.2 Add debounced suggestion refresh when typing in the “New note…” input
- [x] 5.3 Render a minimal suggestions UI attached to the input
- [x] 5.3a Support navigating visible suggestions with existing up/down keybindings
- [x] 5.4 Ensure suggestions never block note creation and degrade gracefully on query errors

## 6. AI word completion

- [x] 6.1 Implement an AI client adapter that builds request URLs from the configured base URL (initial target: Ollama-style endpoint)
- [x] 6.2 Add debouncing + request cancellation so AI calls don’t lag the UI
- [x] 6.3 Implement failure handling: network errors, non-2xx responses, invalid JSON (no hard failures)
- [x] 6.4 Implement accept action for AI completion (documented in Instructions) and ensure it doesn’t break existing form behavior
- [x] 6.5 Ensure AI calls are only made when endpoint is configured (AI disabled otherwise)

## 7. Permissions + manifest considerations

- [x] 7.1 Determine if additional host permissions are required for the configured endpoint (e.g., localhost) and update `manifest.json` if needed
- [x] 7.2 Confirm behavior in Chrome extension context (fetch/CORS) and adjust implementation accordingly

## 8. Manual verification checklist

- [ ] 8.1 Verify AI Settings is reachable/usable in QWERTY mode using existing navigation keys
- [ ] 8.2 Verify AI Settings is reachable/usable in DVORAK mode using existing navigation keys
- [ ] 8.3 Verify Instructions view includes AI Settings + autocomplete and reflects layout toggle
- [ ] 8.4 Verify local suggestions show for existing tasks and AI completion is optional and graceful when endpoint is invalid
