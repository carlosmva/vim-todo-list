## 1. Data model and migration

- [x] 1.1 Add `priority` column to `notes` schema with allowed values `low|normal|high`
- [x] 1.2 Implement idempotent migration for existing DBs (`ALTER TABLE notes ADD COLUMN priority TEXT`)
- [x] 1.3 Backfill existing notes to `normal` priority when missing/empty
- [x] 1.4 Update note read/query mapping to include `priority`
- [x] 1.5 Update note creation to persist `normal` priority for new notes

## 2. Sorting and ordering

- [x] 2.1 Define a priority rank mapping (`high` > `normal` > `low`)
- [x] 2.2 Update note query ordering so priority is the primary sort key
- [x] 2.3 Ensure pending notes retain `sort_order` ordering within the same priority
- [x] 2.4 Decide and implement whether completed notes are also priority-sorted (match spec: priority always)

## 3. Card UI: priority toggle control

- [x] 3.1 Add a priority toggle control to each note card’s actions row (same row as Attachments/Notes/Delete)
- [x] 3.2 Implement toggle activation behavior (cycle low/normal/high deterministically)
- [x] 3.3 Persist priority changes to the DB and refresh the board render
- [x] 3.4 Ensure the toggle is present and usable for both pending and complete cards

## 4. Visual styling

- [x] 4.1 Add CSS hooks for priority state (e.g., `data-priority` on card or note text)
- [x] 4.2 Color-code note text for `high` and `low` while leaving `normal` as default
- [ ] 4.3 Verify readability/contrast in the current theme tokens (no hard-coded new colors)

## 5. Keyboard and accessibility

- [x] 5.1 Ensure the priority toggle is reachable via existing keyboard focus movement (Tab and custom navigation)
- [x] 5.2 Verify Enter activates the priority toggle when focused
- [x] 5.3 Verify focus indicators are visible on the priority toggle

## 6. Export / import compatibility

- [x] 6.1 Decide whether CSV export should include priority; if yes, add a `priority` column to export
- [x] 6.2 Ensure DB export/import round-trips the new priority field (schema migration is applied on import)

## 7. Verification

- [ ] 7.1 Verify new notes start as `normal` priority
- [ ] 7.2 Verify toggling priority reorders cards according to priority ordering
- [ ] 7.3 Verify priority styling updates immediately when toggled
- [ ] 7.4 Verify ordering remains stable within the same priority (pending `sort_order`)
