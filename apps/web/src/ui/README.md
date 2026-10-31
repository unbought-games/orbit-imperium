# Orbit Imperium UI design

Use this guide for design decisions. Open the linked components only when you
need implementation details. Keep feature specifications and historical notes
out of this guide.

## Consistency

Aim for consistency within a view and between views. Before making design
choices, look up similar existing views and follow their established patterns
for layout, controls, terminology, and interaction. Resist introducing new
patterns unless the user provides guidance to do so.

## Visual identity

- Dark navy surfaces, champagne metal for primary actions, ice blue for links
  and secondary accents. Reserve red, amber, and green for meaningful states.
- Editorial serif headings with restrained sans-serif body text. Establish
  hierarchy through size, weight, spacing, and alignment before adding decoration.
- Controls use the game's clipped corners, beveled faces, and pressed feedback.
  Keep decorative clipping separate from focus outlines and hit areas.
- Use 16px icons for standard actions and inline symbols, consistently across
  desktop and mobile. Compact actions use the shared 24px ghost button with 4px
  padding per side. Do not introduce screen-specific size overrides; navigation
  and decorative illustrations may use larger icons when their role warrants it.
- Use the shared palette and spacing. Glows should have a clear focal point,
  fade smoothly, and remain secondary to readable content.

## Information and layout

- Make the player's next decision obvious. Group related controls and give each
  decision one clear primary action.
- Lists are for recognition and comparison. Keep previews brief; put full
  manifests, calculations, and explanations in details or contextual disclosures.
- Align repeated rows and values. Use separators deliberately; avoid decorative
  panels, borders, or repeated labels that add noise.
- Put decision information before artwork on phones. Adapt grouping and spacing
  to available width without horizontal overflow or obscured final controls.
- Use canonical resource icons and colors beside amounts. Keep full names
  accessible; never substitute M/C/D. Compact summaries may abbreviate quantities,
  while spending decisions retain exact values.

## Interaction and state

- Keep the shell, controls, focus, and user edits stable as data loads or filters
  change. Update the affected content without blanking or remounting the screen.
- Distinguish loading, empty, error, disabled, and pending states. Show an empty
  collection only after a successful response; preserve useful content on retry.
- Empty states need a quiet focal point, a clear message, and a useful next action
  when one exists. Their decoration should not compete with the surrounding page.
- Make the clickable area and hover feedback agree. Keep nested actions independent
  from row navigation, and provide equivalent keyboard and touch behavior.
- Preserve visible focus, readable contrast, accessible names, usable touch targets,
  and selectable content. Destructive actions need explicit review and safe focus.
- Preserve immediate UI updates by default. When motion is requested, use it to
  explain a change of state; keep it interruptible and respect reduced motion.
  Do not animate layout in a way that moves a focused control or blocks interaction.

## Visual review

Inspect the actual rendered screen before and after a visual change. Exercise the
interaction, including relevant loading and empty states; a static screenshot can
miss a broken transition. Check desktop and mobile, long content, clipping,
alignment, and focus. Passing tests or reading computed CSS is not visual review.
Follow the screenshot and delivery requirements in [AGENTS.md](../../../../AGENTS.md).

## Component references

Reuse the existing owner of a visual pattern. Extend its explicit API when needed
rather than reaching into another component's private markup or repainting its
interaction states from a feature stylesheet. Read only the relevant source and
its adjacent CSS module.

| Need                           | Source                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette, spacing, typography   | [Tokens](../styles/tokens.css), [typography](typography.tsx)                                                                                                  |
| Actions and navigation         | [Button](button.tsx), [Link](link.tsx), [confirmation](confirmation-button.tsx)                                                                               |
| Segmented selection and forms  | [SegmentedControl](segmented-control.tsx), [form controls](form.tsx), [RichSelect](rich-select.tsx)                                                           |
| Structure and game chrome      | [Panel](panel.tsx), [Section](section.tsx), [GameShell](../shell/game-shell.tsx)                                                                              |
| Empty or connection states     | [EmptyState](empty-state.tsx), [StatePanel](state-panel.tsx)                                                                                                  |
| Resources and coordinates      | [ResourceMark](resource-mark.tsx), [resource amounts](resource-amount.tsx), [quantities](number-value.tsx), [CoordinateLink](../features/coordinate-link.tsx) |
| Contextual details and actions | [Popover](popover.tsx), [ActionPopover](action-popover.tsx), [ActionSheet](action-sheet.tsx)                                                                  |
| Catalogs and decision pages    | [ImageCatalog](image-catalog.tsx), [CatalogStage](catalog-stage.tsx), [DetailLayout](../features/progression/detail-layout.tsx)                               |
| Reduced motion                 | [Preference hook](use-reduced-motion.ts)                                                                                                                      |
