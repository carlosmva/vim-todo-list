## 1. Parse and serialize Properties

- [x] 1.1 Add split/parse/serialize helpers for a closed leading YAML fence (scalars + one-level lists) in `obsidian-markdown.util` and verify unit tests cover closed fence, unclosed `---`, and unknown-key round-trip
- [x] 1.2 Map known keys (`due`, `status`, `board`, `priority`, `vim-todo-id`) to card fields and verify Properties win over body due line / footer when they disagree

## 2. Build, import, and compare

- [x] 2.1 Change `buildObsidianMarkdown` to emit a Properties block (known keys from the card, unknown keys from optional existing Markdown) and verify a write merge keeps `tags` / `aliases`
- [x] 2.2 Change `parseObsidianMarkdownImport` to strip the fence and apply known Properties, and verify title/body do not include YAML
- [x] 2.3 Add structured equality (normalized body + known fields) and verify a vault-only Properties block that matches the card is not a difference

## 3. Sync, import, and conflict UI

- [x] 3.1 Use structured equality in `syncWithVault` / `compareVaultNotes` and verify a properties-only addition does not return `conflict`
- [x] 3.2 Pass existing vault Markdown into `pushNote` / keep-card so unknown Properties survive, and verify the written file still contains them
- [x] 3.3 Extend `updateNoteFromVault` to apply `due_at`, `status`, `board`, and `priority`, and verify keep-vault / missing-note import persist those fields
- [x] 3.4 Store body-only Markdown on the conflict payload, list known Property diffs, and verify the side-by-side preview does not treat the Properties fence as body lines

## 4. Tests

- [x] 4.1 Add/extend `obsidian-markdown.util.spec.ts` for fence split, known-key import, equality, and write merge
- [x] 4.2 Extend `obsidian-conflict-diff.util.spec.ts` (or modal helper tests) so a properties-only prefix does not mark title/footer as changed
- [x] 4.3 Extend `obsidian.service.spec.ts` for properties-only sync equality and keep-card preserve
