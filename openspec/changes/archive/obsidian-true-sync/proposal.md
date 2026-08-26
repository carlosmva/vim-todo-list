# Proposal: Obsidian true sync

## Why

The extension can link notes to Markdown files in an Obsidian vault, but today’s behavior mixes **URI handoffs** (`obsidian://new` / `open`) with **optional** File System Access writes. That leads to gaps: updates may not land in the vault when paths look “already created,” embedded hosts block custom schemes, and reusing `new` with content can spawn duplicate notes (`note 1`, `note 2`). **True sync** means a clear, testable contract for keeping the app’s note model and vault files consistent when the user opts in—without relying on fragile one-off workarounds.

## What Changes

- Define **requirements** for **vault-backed sync** (read/write `.md` under a linked folder) as the primary path when Sync mode and a vault handle are active.
- Specify **conflict and ordering rules** (timestamps vs. content, when to import vs. export, user prompts) so behavior is predictable—not “whatever the last click did.”
- Clarify **obsidian://** usage: first create vs. open only; **no** requirement to use `new`+content for updates after a file exists (avoids duplicate files in Obsidian).
- Cover **embedding / CSP** constraints: opening Obsidian must not depend on navigating the extension document to `obsidian:` (e.g. use `chrome.tabs.create` or equivalent).
- Optional follow-ups (scoped in design/tasks): **background** or **debounced** push so the vault stays in sync without only clicking “Obsidian”.

## Capabilities

### New Capabilities

- `obsidian-vault-sync`: End-to-end behavior for Obsidian integration when a vault name, optional notes folder, Sync mode, and linked vault directory handle are configured—including mapping to Markdown paths, merge rules, conflict handling, and when to open Obsidian vs. write only.

### Modified Capabilities

- *(none)* — Existing specs (`note-due-dates`, `calendar-view`, `note-prioritization`, `popup-text-link-controls`) are not required to change their user-facing requirements for this work; Obsidian sync is additive.

## Impact

- **Code:** `popup.js` (Obsidian helpers, sync flow, navigation), `manifest.json` if new permissions are required; `pick-vault.html` / `pick-vault.js` / `obsidian-vault-idb.js` as needed; `popup.html` settings copy.
- **Platform:** Chromium extension APIs (`chrome.tabs`, File System Access, IndexedDB for handles); Obsidian as external protocol handler.
- **Risk:** File writes and merge logic can overwrite or import content; must stay behind explicit user settings and clear conflict UX.
