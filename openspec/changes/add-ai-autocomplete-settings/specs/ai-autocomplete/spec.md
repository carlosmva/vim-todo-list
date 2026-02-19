## ADDED Requirements

### Requirement: User can configure an AI autocomplete endpoint
The popup UI SHALL provide an AI Settings view where the user can configure an AI endpoint base URL used for autocomplete.

#### Scenario: User can configure custom words for autocomplete
- **WHEN** the user enters one or more custom words (single words/acronyms; letters/digits with optional internal hyphens/underscores like `pre-eQuote` or `pre_eQuote`; no spaces) in AI Settings and saves
- **THEN** those words are used to expand local word completion suggestions

#### Scenario: User opens AI Settings from the header controls
- **WHEN** the user focuses the AI Settings control in the header and activates it
- **THEN** the AI Settings view is displayed

#### Scenario: User can save an endpoint base URL
- **WHEN** the user enters a valid URL (e.g., `http://localhost:11434`) and saves
- **THEN** the system persists the configured base URL for future popup sessions

#### Scenario: Empty endpoint disables AI completion
- **WHEN** the user clears the endpoint value and saves
- **THEN** AI-backed word completion is disabled

### Requirement: AI Settings is accessible with existing key bindings in QWERTY and DVORAK layouts
The system SHALL ensure the AI Settings control and AI Settings view are accessible via the existing in-app navigation model in both QWERTY and DVORAK key layouts.

#### Scenario: User can reach AI Settings using existing navigation keys (QWERTY)
- **WHEN** the key layout is QWERTY and the user uses the existing navigation keys to move focus to the header controls
- **THEN** the AI Settings control can be focused and activated

#### Scenario: User can reach AI Settings using existing navigation keys (DVORAK)
- **WHEN** the key layout is DVORAK and the user uses the existing navigation keys to move focus to the header controls
- **THEN** the AI Settings control can be focused and activated

#### Scenario: User can operate AI Settings view via keyboard
- **WHEN** the AI Settings view is displayed
- **THEN** the primary endpoint input can be focused and edited and the view can be closed without requiring the mouse

### Requirement: In-app Instructions reflect AI Settings and autocomplete keys for the active layout
The in-app Instructions view SHALL include guidance for accessing AI Settings and using autocomplete, and it SHALL reflect the currently selected QWERTY/DVORAK key layout.

#### Scenario: Instructions mention AI Settings access
- **WHEN** the user opens the Instructions view
- **THEN** the instructions include how to access AI Settings using the existing navigation model

#### Scenario: Instructions update when layout toggles
- **WHEN** the user changes the key layout toggle between QWERTY and DVORAK
- **THEN** the Instructions view reflects the correct keys for the selected layout

### Requirement: New note input provides local DB-backed suggestions
The “New note…” text input SHALL provide autocomplete suggestions derived from existing task/note names stored in the local SQLite DB.

#### Scenario: Local suggestions are shown for matching text
- **WHEN** the user types a prefix that matches one or more existing note texts
- **THEN** the system presents one or more local suggestions

#### Scenario: Word completion works while typing sentences
- **WHEN** the user types a multi-word sentence and the current word is a prefix of a word seen in existing notes (e.g., "Get Plan")
- **THEN** the system can offer a completion for the current word (e.g., "Get Planview")

#### Scenario: Word completion can use an English dictionary
- **WHEN** the user types a multi-word sentence and the current word is a prefix of a common English word (e.g., "resul")
- **THEN** the system can offer a completion for the current word (e.g., "results") even if the word is not present in the local DB

#### Scenario: User can navigate suggestions with existing up/down keybindings
- **WHEN** the user is typing in the “New note…” input and local suggestions are visible
- **THEN** the user can move through the visible suggestions using the existing in-app up/down keybindings

#### Scenario: Local suggestions do not block note creation
- **WHEN** local suggestions cannot be generated (e.g., query error)
- **THEN** the user can still create a note normally

### Requirement: New note input provides optional AI word completion
When an AI endpoint is configured, the system SHALL provide word-level completion suggestions for the “New note…” text input using the configured endpoint.

#### Scenario: AI completion is requested only when enabled
- **WHEN** the AI endpoint is not configured
- **THEN** the system does not send autocomplete requests to any AI endpoint

#### Scenario: AI completion failures degrade gracefully
- **WHEN** an AI completion request fails (network error, invalid response, or non-2xx status)
- **THEN** the UI remains usable and local suggestions (if any) continue to function

#### Scenario: User can accept an AI completion
- **WHEN** an AI completion suggestion is visible and the user triggers the documented accept action
- **THEN** the suggestion is inserted into the “New note…” input

#### Scenario: Tab accepts the local “Complete” recommendation when shown
- **WHEN** a local “Complete” recommendation is visible while typing in the “New note…” input
- **THEN** pressing Tab inserts that completion
