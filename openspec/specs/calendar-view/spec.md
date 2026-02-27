# calendar-view Specification

## Purpose
TBD - created by archiving change add-due-dates-and-calendar-view. Update Purpose after archive.
## Requirements
### Requirement: Calendar view is accessible from the header
The system SHALL provide a Calendar view accessible from the header, alongside Dashboard and other views.

#### Scenario: Calendar link in header
- **WHEN** the user views the popup header
- **THEN** a Calendar link (or button) is visible next to Dashboard

#### Scenario: Navigating to Calendar view
- **WHEN** the user activates the Calendar link
- **THEN** the Calendar view is displayed

### Requirement: Calendar shows current month and 3 months ahead
The Calendar view SHALL display a calendar grid for the current month plus 3 months in advance (4 months total).

#### Scenario: Four months visible
- **WHEN** the user opens the Calendar view
- **THEN** the view shows the current month and the following 3 months

#### Scenario: Months are labeled
- **WHEN** the user views the calendar
- **THEN** each month is clearly labeled (e.g., month name and year)

### Requirement: Calendar displays pending tasks due per day
Each day cell in the calendar SHALL list pending (incomplete) tasks that are due on that date.

#### Scenario: Day shows due tasks
- **WHEN** a day has one or more pending notes with that due date
- **THEN** the day cell displays those tasks (e.g., task text or count)

#### Scenario: Day empty when no due tasks
- **WHEN** a day has no pending notes with that due date
- **THEN** the day cell is empty or shows no tasks

#### Scenario: Completed tasks not shown
- **WHEN** a note is completed (status = complete)
- **THEN** it does not appear in the calendar, even if it had a due date

### Requirement: Clicking a task navigates to notes view
When the user clicks (or activates) a task in the calendar, the system SHALL navigate to the notes view and focus or highlight that task.

#### Scenario: Click task opens notes view
- **WHEN** the user clicks a task in the calendar
- **THEN** the view switches to the notes view and the corresponding note card is focused or brought into view

