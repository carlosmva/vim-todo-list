## Style Layer Update

- Added `modern.css` and loaded it after `popup.css` in `popup.html`.
- `modern.css` now acts as the final visual layer for cards, tabs, headers, utility panels, and motion tokens.
- Existing behavior remains driven by `popup.js`; no keybinding logic was changed.

## Rollback

- Remove `<link rel="stylesheet" href="modern.css" />` from `popup.html` to disable the modern layer and revert to baseline popup styling.
