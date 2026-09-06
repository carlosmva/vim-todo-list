## Purpose

Keep Obsidian Properties as first-class note metadata so vault files with a YAML properties block compare, import, and export without treating that block as body Markdown or destroying user-defined keys.

## ADDED Requirements

### Requirement: Properties block is not note body

When a vault Markdown file begins with a closed YAML frontmatter fence (`---` on the first line and a later line that is only `---`), the system SHALL treat the enclosed block as Properties and SHALL NOT treat those lines as the note title or notes body.

#### Scenario: Import skips the properties fence

- **WHEN** a vault file starts with a closed Properties block and then a `# Title` heading
- **THEN** import SHALL use that heading as the title and SHALL NOT include the Properties fence or its keys in the notes body

#### Scenario: Unclosed leading dashes stay body

- **WHEN** a vault file starts with `---` but has no later closing fence line
- **THEN** the system SHALL treat the file as having no Properties and SHALL parse it as body Markdown

### Requirement: Known properties map to card fields

The system SHALL read and write these Properties keys when present: `due` (UTC calendar date), `status` (`pending` or `complete`), `board`, `priority` (`low`, `normal`, or `high`), and `vim-todo-id` (note id). On import, a known Property SHALL win over the same fact expressed only in the body due line or footer when both exist and disagree. The body due line, board footer, and `#vim-todo/*` tags SHALL remain so existing files and id lookup keep working.

#### Scenario: Due is taken from properties

- **WHEN** Properties include `due: 2026-01-15` and the body has a different `**Due:**` line
- **THEN** import SHALL set the card due date to 15 Jan 2026 UTC

#### Scenario: Status is taken from properties

- **WHEN** Properties include `status: complete` and the footer tag is `#vim-todo/pending`
- **THEN** import SHALL set the card status to complete

### Requirement: Unknown properties are preserved on write

When the system writes a mapped vault file that already has Properties, it SHALL keep keys it does not own (including `tags`, `aliases`, `cssclasses`, and user-defined keys) and SHALL update or insert the known keys from the card. The system SHALL NOT strip a Properties block solely because the card has no equivalent UI for those keys.

#### Scenario: Keep-card keeps user tags

- **WHEN** the vault file has Properties `tags` and `aliases` and the user chooses keep-card
- **THEN** the written file SHALL still contain those `tags` and `aliases` values

#### Scenario: First write without existing properties adds known keys

- **WHEN** the system creates or overwrites a mapped file that had no Properties block
- **THEN** the written file SHALL include a Properties block with the known keys that have values on the card

### Requirement: Compare ignores properties-only additions

Equality between a card and its vault file SHALL use normalized body Markdown (title, optional due line, notes body, footer) plus known field values. A vault-only Properties block whose known keys match the card SHALL NOT by itself count as a difference. Unknown extra Properties SHALL NOT by themselves count as a difference.

#### Scenario: Body match with new properties is equal

- **WHEN** the card body matches the vault body and the vault has a Properties block whose `due`, `status`, `board`, `priority`, and `vim-todo-id` match the card or are absent
- **THEN** the system SHALL NOT present a conflict

#### Scenario: Known property mismatch is a conflict

- **WHEN** the body Markdown matches and Properties `due` or `status` disagrees with the card
- **THEN** the system SHALL present the conflict UI

### Requirement: Conflict diff compares body Markdown only

The side-by-side conflict preview SHALL diff normalized body Markdown without the Properties fence so a leading `---` block cannot shift or pair against the footer separator. When known Properties disagree, the conflict UI SHALL also list those field differences.

#### Scenario: Properties do not rewrite the line diff

- **WHEN** the vault file gained only a Properties block and the body also differs by one line
- **THEN** the line diff SHALL highlight that body line and SHALL NOT mark the title and footer as changed solely because of the Properties fence

#### Scenario: Property-only conflict lists fields

- **WHEN** the only disagreement is Properties `due` versus the card due date
- **THEN** the conflict UI SHALL show the two due values and the body previews MAY be identical
