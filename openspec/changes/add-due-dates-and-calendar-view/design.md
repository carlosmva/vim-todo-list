## Context

The extension uses `popup.html` + `popup.js` with an embedded SQLite DB (sql.js). Notes are stored in a `notes` table with columns: id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board. The create form has a text input and Add button; notes are rendered as cards with a front (text, attachments preview, actions) and back (attachments management). Header links switch between views: Notes, Dashboard, Manage Tabs, Instructions, About, AI Settings.

## Goals / Non-Goals

**Goals:**
- Add optional `due_at` (or equivalent) to notes; prompt for it when creating a note.
- Display and edit due date on the card front.
- Add a Calendar view showing current month + 3 months ahead with pending tasks due per day.
- Navigate from calendar task click to notes view with that task focused.

**Non-Goals:**
- Recurring due dates, reminders, or notifications.
- Calendar export (iCal, etc.).
- Time-of-day for due dates (date-only is sufficient).

## Decisions

### 1) Store due date as `due_at` INTEGER (Unix timestamp, start of day UTC)

- Add `due_at INTEGER` to `notes` table. NULL means no due date.
- Use start-of-day UTC for consistency (avoids timezone edge cases for "due on date X").
- Migration: `ALTER TABLE notes ADD COLUMN due_at INTEGER`; existing notes get NULL.

*Alternatives considered*
- Date string (YYYY-MM-DD): works but INTEGER is consistent with `created_at`/`updated_at` and easier to query/compare.
- Local date: rejected; extension has no server, so UTC start-of-day is simplest.

### 2) Prompt for due date inline in the create form (not modal)

- Add a date input (or compact date picker) next to the New note input. User can type or pick a date before clicking Add.
- If left empty, note is created without due date. No separate "step" or modal—keep the flow single-form.

*Alternatives considered*
- Modal after Add: adds friction; inline is faster.
- Required due date: rejected; many notes don't need dates.

### 3) Due date control on card front: clickable label + date picker

- Show due date as a small label/control at the top of the card front (e.g., "Due: Mar 15" or icon + date).
- Clicking it opens a native `<input type="date">` or a lightweight picker. User can change or clear.
- Use `input type="date"` for simplicity; style to match the compact card aesthetic.

*Alternatives considered*
- Inline editable text: more complex, date parsing/validation; native input is reliable.
- Dropdown in actions row: spec says "front of card"; top of card is more prominent.

### 4) Calendar view: 4-column grid (one month per column)

- Layout: 4 columns, one per month. Each column shows a calendar grid (7 columns for weekdays, rows for weeks).
- Query: `SELECT * FROM notes WHERE status = 'pending' AND due_at IS NOT NULL AND due_at >= ? AND due_at < ?` (range for 4 months).
- Group results by date; render task text (or truncated) in each day cell. Overflow: show count + "more" or scroll within cell.

*Alternatives considered*
- Single month with next/prev: spec says "current + 3 months"; 4-column gives at-a-glance view.
- Full task text in cell: may overflow; truncate with tooltip or expand on hover.

### 5) Calendar header link placement

- Add "Calendar" link in `headerLinks` between Dashboard and existing links (or next to Dashboard). Follow existing pattern (e.g., `dashboardBtn` → `calendarLink`).

### 6) Navigate to note on calendar task click

- Store `noteId` (and optionally `board`) on each calendar task element.
- On click: switch to notes view, set `activeBoard` if needed, call `refresh()`, then `document.querySelector` the card by `data-note-id` and `scrollIntoView` / `focus` it.

## Risks / Trade-offs

- **[Date input UX on small popup]** → Mitigation: Use compact layout; `input type="date"` is native and small. Consider `min`/`max` if needed.
- **[Calendar grid overflow on narrow viewports]** → Mitigation: Popup is fixed width (~720px); 4 months may need horizontal scroll or 2x2 grid on very small. Start with 4 columns, adjust if needed.
- **[Migration for existing DBs]** → Mitigation: Standard `ALTER TABLE` in migration block; NULL for existing notes is correct.

## Migration Plan

1. Add migration in `initDb`: `ALTER TABLE notes ADD COLUMN due_at INTEGER`.
2. No rollback needed; column can remain if we ever revert (NULL is harmless).
3. Export/Import: ensure CSV export includes due_at if present; import parses it.

## Open Questions

- Whether to show "overdue" styling (e.g., red) for past due dates. Spec does not require it; can add later.
- Keyboard shortcut for focusing due date on a card (e.g., from calendar or notes view). Out of scope for initial implementation.
