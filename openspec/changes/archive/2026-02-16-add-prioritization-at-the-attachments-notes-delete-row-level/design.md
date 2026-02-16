## Context

This project is a Chrome extension popup (MV3) that renders a kanban-style board of notes.

- Notes are persisted in an embedded SQLite DB (sql.js) stored in `chrome.storage.local`.
- Notes are rendered as cards with a single “actions row” currently containing: Attachments (flip), Notes, Delete, and status change (Mark complete / Move to pending).
- Pending notes support drag-and-drop ordering via a persisted `sort_order` column.
- The popup has extensive keyboard navigation and link-style button controls.

The change adds a per-card priority attribute that affects (1) rendering/UX and (2) ordering.

## Goals / Non-Goals

**Goals:**
- Add a per-note priority value with three states: `low`, `normal`, `high`.
- Add a priority toggle control in the same row as Attachments / Notes / Delete.
- Default all newly created notes to `normal` priority.
- Make priority visible via color-coding of the card’s note text.
- Always order cards by priority (priority is the primary ordering key).
- Preserve existing semantics and keyboard accessibility (toggle is focusable and Enter/Click activatable).

**Non-Goals:**
- No custom priority scales, labels, or user-defined colors.
- No new filtering UI (“show only high priority”).
- No changes to boards/tabs behavior beyond sorting.
- No new persistence backends or external dependencies.

## Decisions

### 1) Persist priority in the `notes` table

**Decision:** Add a `priority` column to `notes` with allowed values `low|normal|high`.

- Storage type: `TEXT`.
- Constraint: `CHECK (priority IN ('low','normal','high'))`.
- Default: `normal`.

**Rationale:**
- Priority must survive popup reloads and board switches.
- A DB column is consistent with existing persisted note attributes (status, board, sort_order).

**Alternatives considered:**
- Encode priority in note text prefix (e.g., “!!!”): rejected (leaky UX, harder to change without editing content).
- Store priority only in DOM/state: rejected (not persistent).

### 2) Migration strategy for existing databases

**Decision:** Perform an in-place migration using `ALTER TABLE notes ADD COLUMN priority TEXT` followed by a backfill:

- Backfill: `UPDATE notes SET priority = 'normal' WHERE priority IS NULL OR priority = ''`.

**Rationale:**
- The extension already uses similar “best-effort” migrations for new columns.
- Backfilling avoids NULL handling throughout the rendering and sorting code.

**Alternatives considered:**
- Create a new table + copy: rejected (more risk/complexity for a popup extension).

### 3) Priority toggle UX: single cycling button on the actions row

**Decision:** Implement the priority control as a single `<button>` that cycles values on activation:

`normal → high → low → normal` (exact cycle order can be tuned, but must be deterministic).

The button lives on the front face action row alongside existing action controls.

**Rationale:**
- Minimal UI footprint; matches the existing action-row interaction model.
- Avoids introducing new components (dropdowns/menus) and reduces keyboard complexity.

**Alternatives considered:**
- Dropdown / segmented control: rejected (more UI chrome and more focus targets).

### 4) Ordering rules: priority is always the primary sort key

**Decision:** Update note ordering so within each column (pending and complete), cards are ordered by priority first.

Proposed priority rank: `high` first, then `normal`, then `low`.

- Pending column ordering (conceptually):
  1) priority rank
  2) existing `sort_order` (for user-driven ordering)
  3) created_at / id as stable tie-breakers

- Complete column ordering (conceptually):
  1) priority rank
  2) completed_at (or existing timestamp ordering) as a stable tie-breaker

**Rationale:**
- The user requirement is explicit: “order the cards by priority always.”
- Keeping `sort_order` as secondary preserves existing user ordering within the same priority bucket.

**Alternatives considered:**
- Priority only affects pending, not complete: rejected unless explicitly requested later.
- Maintain separate sort orders per priority group: possible but heavier; not required for an MVP.

### 5) Behavior on changing priority for pending notes

**Decision:** When a pending note’s priority changes, optionally set its `sort_order` to the end of the destination priority bucket (computed as max sort_order among pending notes with the new priority + 1).

**Rationale:**
- Avoids surprising “teleporting” to a random position within the destination priority section.
- Keeps DnD ordering intuitive within the new group.

**Alternatives considered:**
- Keep existing sort_order unchanged: simplest, but can land the card mid-bucket unpredictably.

### 6) Visual priority indicator: color-code the note text using existing theme tokens

**Decision:** Apply priority-specific styling to the note text element (e.g., `.noteText`) based on a card-level marker (e.g., `data-priority="high"`).

- `normal`: default text color (no override).
- `low`: use an existing “secondary text” token.
- `high`: use an existing semantic emphasis token.

**Rationale:**
- The requirement asks for color-coding and specifically mentions “card note text.”
- Using existing design-system tokens avoids introducing new hard-coded colors.

**Alternatives considered:**
- Border/background highlight on the entire card: rejected (request is text color; also risks clashing with existing tile styling).

## Risks / Trade-offs

- **[Migration risk]** Old DBs may contain unexpected schema states → Mitigation: keep migrations idempotent and backfill NULL/empty values.
- **[Ordering vs. DnD expectations]** Priority-first sorting can make manual ordering feel less “global” → Mitigation: preserve `sort_order` within the same priority bucket; optionally move to end of destination bucket on change.
- **[Accessibility/contrast]** Priority colors may reduce readability in some themes → Mitigation: use existing semantic tokens with known contrast; avoid low-contrast combinations.
- **[Export compatibility]** CSV exports/imports may lose priority if not included → Mitigation: add a `priority` column to CSV export if the format is intended to round-trip, or explicitly document that CSV is a view-only export.

## Migration Plan

1. Add `priority` column to `notes` table (best-effort `ALTER TABLE`).
2. Backfill existing rows to `normal`.
3. Update note insert logic to set `priority = 'normal'` explicitly.
4. Update queries to include `priority` and order by priority rank first.
5. Render a priority toggle button in the note action row and handle cycling updates.
6. Add CSS selectors for priority-based note text coloring.
7. Verify keyboard navigation reaches the new toggle and activation works.

Rollback strategy: the new column is additive; if needed, ignore the column and treat all notes as `normal`.

## Open Questions

- Should complete notes also be priority-sorted, or only pending?
- Should priority color apply only to the note text, or also to the card title/attachments preview?
- Do we want a keyboard shortcut to cycle priority while focused on a card?
- What is the exact cycle order for the toggle (normal→high→low vs normal→low→high)?
