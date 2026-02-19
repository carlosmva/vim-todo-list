## Why

Creating todos quickly is the core workflow, and typing repetitive task names slows it down. Adding local + AI-backed autocomplete (with a configurable self-hosted endpoint like Ollama) makes entry faster while keeping the feature optional and privacy-friendly.

## What Changes

- Add an **AI Settings** control in the popup’s top row next to the light/dark toggle.
- Add a settings view to configure an AI autocomplete endpoint URL (e.g., `http://localhost:11434`).
- Add autocomplete in the “new item” text field on the main screen:
  - Suggest completions from existing task names in the local DB.
  - Provide word-level autocompletion via the configured AI endpoint.
- Handle missing/invalid endpoint gracefully (no hard failures; local suggestions still work).

## Capabilities

### New Capabilities
- `ai-autocomplete`: UI + storage for configuring an AI endpoint, and autocomplete behavior in the new-item text field (local DB suggestions and AI word completion).

### Modified Capabilities
- (none)

## Impact

- Popup UI: updates to the top-row controls, a small settings UI, and the new-item input behavior.
- Storage: persist the endpoint URL (extension storage/local storage).
- Data layer: query existing local DB task names to power suggestions.
- Networking: call the configured endpoint from the extension; may require manifest host permissions depending on implementation.
