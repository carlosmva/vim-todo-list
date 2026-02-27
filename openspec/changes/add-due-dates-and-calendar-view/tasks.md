## 1. Database and data model

- [x] 1.1 Add `due_at INTEGER` column to notes table via migration in initDb
- [x] 1.2 Update insertNote to accept optional due_at parameter
- [x] 1.3 Update note queries (loadNotes, etc.) to include due_at in SELECT and result mapping
- [x] 1.4 Add updateNoteDueAt(db, noteId, dueAt) helper; support null to clear

## 2. Create-note flow (due date prompt)

- [x] 2.1 Add due date input (type="date") to create form in popup.html, optional/empty by default
- [x] 2.2 On form submit: read due date value, convert to start-of-day UTC timestamp (or null if empty)
- [x] 2.3 Pass due_at to insertNote when creating note
- [x] 2.4 Clear due date input after successful add (or leave for next note—design choice)

## 3. Card front: display and edit due date

- [x] 3.1 In renderNotes: add due date element at top of card front when note.due_at is set
- [x] 3.2 Format due_at as human-readable (e.g., "Due: Mar 15" or short format)
- [x] 3.3 Make due date clickable; on click show date picker (input type="date" or inline picker)
- [x] 3.4 On date change: call updateNoteDueAt, persist, refresh
- [x] 3.5 Add "Clear" or empty-state to remove due date from a note
- [x] 3.6 Add CSS for due date display (popup.css / modern.css)

## 4. Persistence and export/import

- [x] 4.1 Ensure persistOrderFromDom does not overwrite due_at (or include due_at from card dataset if we store it there)
- [x] 4.2 Update CSV export to include due_at column when present
- [ ] 4.3 Update CSV import to parse due_at if column exists (N/A: no CSV import in codebase)

## 5. Calendar view structure

- [x] 5.1 Add Calendar link/button in header (popup.html) next to Dashboard
- [x] 5.2 Add calendarView container in popup.html (similar to dashboardView)
- [x] 5.3 Add showCalendarView / hideCalendarView and wire Calendar link click
- [x] 5.4 Implement queryNotesByDueRange(db, startTs, endTs) for pending notes with due_at in range

## 6. Calendar grid rendering

- [x] 6.1 Render 4 months: current + next 3; compute month boundaries (start/end of month in UTC)
- [x] 6.2 For each month: render calendar grid (7 weekdays, 5–6 rows)
- [x] 6.3 For each day: query notes with due_at on that date; render task text (truncated) or count
- [x] 6.4 Style calendar grid (popup.css / modern.css); handle overflow in day cells

## 7. Calendar → notes navigation

- [x] 7.1 Store noteId (and board if needed) on each calendar task element
- [x] 7.2 On task click: switch to notes view, set activeBoard if needed, refresh, then scroll/focus the card
- [x] 7.3 Integrate with existing view-switching and keyboard navigation

## 8. Instructions and polish

- [x] 8.1 Update in-app Instructions to mention due dates and Calendar view
- [x] 8.2 Verify keyboard navigation includes Calendar view and due date controls
- [ ] 8.3 Test migration on existing DB (no due_at); verify no regressions
