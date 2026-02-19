## Context

The popup currently uses `vendor/carbon.min.css` plus `popup.css`, with interaction behavior and keyboard flows defined in `popup.js`. The change introduces a modern visual layer (`modern.css`) for cards, tabs, spacing, and motion while preserving existing semantics: current keybindings and priority color meaning (`low/normal/high`) must remain unchanged.

Constraints:
- Chrome extension popup dimensions are fixed (`720x600`) and content must remain readable without layout breakage.
- Existing DOM hooks in `popup.js` should stay stable to avoid behavioral regressions.
- Focus visibility and keyboard accessibility must not regress.

## Goals / Non-Goals

**Goals:**
- Introduce a new visual theme layer via `modern.css` that modernizes cards, tabs, and section surfaces.
- Add lightweight motion for state changes (tab activation, card flip/hover, view transitions) with low latency.
- Keep current keybindings, action semantics, and tab switching behavior intact.
- Preserve existing widget color codes, especially priority text colors.
- Maintain accessibility affordances (visible focus rings, readable contrast, reduced-motion handling).

**Non-Goals:**
- Changing application logic, key mapping behavior, or storage schema in `popup.js`.
- Rebuilding the popup with a new UI framework.
- Introducing new data capabilities or changing note prioritization semantics.

## Decisions

1. Add `modern.css` as the final stylesheet in `popup.html`.
- Decision: Load `modern.css` after `popup.css` to make theme overrides explicit and isolated.
- Rationale: Reduces churn in `popup.css` and keeps the modernization reversible.
- Alternative considered: Rewrite `popup.css` directly. Rejected because it mixes legacy and new styling concerns, increasing regression risk.

2. Use tokenized CSS variables in `modern.css` for surfaces, borders, text emphasis, and motion timings.
- Decision: Define theme tokens under `:root` (and scoped containers when needed) and map component styles to tokens.
- Rationale: Enables consistent visual language and easier iteration without touching many selectors.
- Alternative considered: Hard-coded values per selector. Rejected due to maintainability and inconsistent styling risk.

3. Preserve priority colors by treating them as locked semantic tokens.
- Decision: Keep existing priority selectors/values (`.noteCard[data-priority=...] .noteText`) unchanged or mapped 1:1 to same colors.
- Rationale: Proposal explicitly requires preserving current color-code meaning.
- Alternative considered: Update priority palette to a new scheme. Rejected because it changes existing user mental model.

4. Keep interaction and keyboard behavior unchanged by minimizing markup/JS modifications.
- Decision: Prefer CSS-only enhancements, adding only non-semantic wrapper classes/data hooks if absolutely necessary.
- Rationale: `popup.js` is extensive and event-driven; unnecessary structural changes create high regression risk.
- Alternative considered: Larger DOM refactor for cleaner class naming. Rejected for this change scope.

5. Add motion with accessibility safeguards.
- Decision: Use short transitions (100-220ms), transform/opacity-first animations, and `prefers-reduced-motion: reduce` fallbacks.
- Rationale: Improves polish without introducing sluggishness or accessibility issues.
- Alternative considered: No motion. Rejected because animations are part of requested outcome.

6. Preserve and strengthen focus styles across modernized controls.
- Decision: Keep existing focus semantics and ensure modern styles do not mask outlines/contrast.
- Rationale: Keyboard navigation is a core workflow requirement.
- Alternative considered: Minimal focus visuals for cleaner look. Rejected due to accessibility and usability risks.

## Risks / Trade-offs

- [Theme override conflicts with Carbon defaults or existing popup selectors] -> Mitigation: constrain overrides to popup-specific selectors and validate key views (`notes`, `instructions`, `dashboard`, `manage tabs`).
- [Animations create motion discomfort or reduce responsiveness] -> Mitigation: enforce short durations and respect `prefers-reduced-motion`.
- [Visual changes unintentionally alter interaction affordances] -> Mitigation: preserve button semantics/classes and regression-test keyboard/focus flows.
- [Priority colors drift from existing meaning] -> Mitigation: snapshot and lock priority color values as acceptance criteria during implementation.

## Migration Plan

1. Add `modern.css` and include it in `popup.html` after `popup.css`.
2. Implement modernized tokens and component-level overrides (cards, tabs, headers, utility panels).
3. Add motion primitives with reduced-motion support.
4. Run manual regression checks for keyboard commands, tab switching, note actions, and focus states.
5. Rollback strategy: remove the `modern.css` include from `popup.html` to restore prior appearance immediately.

## Open Questions

- Should typography remain Carbon-default for consistency, or should the modern layer introduce a distinct primary typeface?
- Should theme variables support future light/dim variants, or remain single-theme for this change?
- Which specific interactions should animate beyond card/tab transitions to maximize clarity without noise?
