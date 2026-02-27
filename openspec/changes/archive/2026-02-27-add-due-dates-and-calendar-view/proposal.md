## Why

Users need to track when tasks are due. Without due dates, the extension is purely a kanban board with no time-based visibility. Adding optional due dates and a calendar view lets users see what's coming up and plan their work across the current month and beyond.

## What Changes

- **New note flow**: When a user adds a new note, prompt for an optional due date (date picker or similar). The note can be created without a due date (skip/optional).
- **Card front**: Display and edit the due date on the front of each note card. The due date appears near the top of the card and is editable inline or via a control.
- **Calendar view**: A new view next to Dashboard in the header. Shows a calendar grid for the current month plus 3 months ahead. Each day cell lists pending (incomplete) tasks that are due on that date. Clicking a task navigates to the notes view with that task focused.

## Capabilities

### New Capabilities

- `note-due-dates`: Notes can have an optional due date. New notes prompt for due date. Due date is displayed and editable on the card front.
- `calendar-view`: A calendar view showing current month and 3 months ahead with pending tasks due per day.

### Modified Capabilities

- `note-prioritization`: Notes may display due date in addition to priority on the card. No change to priority behavior itself.

## Impact

- **Database**: Add `due_at` (or `due_date`) column to `notes` table (INTEGER timestamp or date string; migration for existing DBs).
- **popup.js**: Create-note flow (form submit), card rendering, card actions, persistence.
- **popup.html**: Create form (due date input), header links (add Calendar next to Dashboard).
- **popup.css / modern.css**: Styles for due date display on cards, calendar grid.
- **Queries**: Notes queries must include due date; calendar view needs a query for notes by date range and status.
