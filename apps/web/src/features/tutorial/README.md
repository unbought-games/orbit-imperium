# Tutorial presentation

Keep tutorial-specific rules and presentation in this feature. Catalog pages
must not check tutorial flags or initiate guidance.

- `advisor-model.ts` owns lesson eligibility and authored explanations.
- `advisor-history.ts` records displayed lesson and reward receipt IDs in browser storage, scoped to
  the full account/universe/epoch/player binding. This is presentation history,
  not tutorial completion or game state; blocked storage falls back to the session.
- `advisor.tsx` owns route matching, disclosure choices, the speech bubble and
  its keyboard/focus behavior. It integrates once through `CommandHud` and uses
  the orb's generic trigger props. The orb stays mounted and keeps its placement.
- Onboarding progress, rewards and eligibility remain authoritative in the game
  store. Viewing or dismissing guidance sends no gameplay commands.
- `briefing-icon.tsx` opens the Briefing from the Empire heading. Its glow is
  derived from the initial unread visit and completed objective IDs. Clicking
  acknowledges only the currently displayed progress, using separate briefing
  events in the binding-scoped presentation history. New completions, including
  the final objective, light it again; reduced motion keeps a static glow.
  The Briefing page also records delivered progress as read, covering sidebar
  and menu visits and book clicks made before the tutorial response arrives.
  The custom link floats outside header flow to preserve title spacing. Hover
  and keyboard focus intensify its stars and orbiting glints without a button
  background; its ambient motion explicitly opts out of the global CSS reset.

A lesson opens automatically only on its first visit. Later visits start closed;
clicking the orb toggles the current lesson. Leaving an eligible page restores
normal command-HUD behavior. Command uplink remains accessible from the bubble.

Completion celebrations also enter through `TutorialAdvisor`:

- `advisor-celebration.ts` selects unseen authoritative reward receipts and keeps
  only selected IDs as local presentation state. It batches simultaneous or
  offline accomplishments and totals actual receipt payments, never forecast
  objective rewards. Seen receipt IDs are scoped to the same binding as lessons.
- `advisor-celebration-content.tsx` shows completion, automatic payment, a Briefing
  link, and the next unfinished directive after the celebrated completion using
  the shared destination selector. Batched celebrations continue after their
  furthest directive in checklist order; they never wrap to earlier unfinished
  work. The Briefing page has no separate latest-receipt block.
- A celebration takes priority over route lessons, waits while Command uplink is
  open, and can be hidden/reopened with the orb. Following either link clears it.
  Displayed receipts do not automatically replay after refresh or reload.
- This remains available in the full interface, including the last accomplishment.
  It never issues an order, grants resources, or infers completion from a timer.

The energy-first opening is authored and versioned by the engine. The frontend
renders the pinned objectives and recommends server-provided IDs; it does not
store its own completion flags. `advisor-model.ts` owns solar-power, growing-mine,
and power-recovery lessons plus the resource-settings review. The review's
`ProductionReviewAction` sends a dedicated acknowledgement and never changes
production allocations. Catalog and resource-settings components contain no
onboarding-specific checks. Directive purposes come directly from the server.
The single final definition lives in `crates/engine/src/tutorial-program.json`.

Personal sites in Galaxy reuse the authoritative private tutorial read; no site
data is added to the public Galaxy projection. `galaxy-sites-model.ts` owns
coordinate grouping, status and dispatch preparation. `galaxy-sites.tsx` renders
a quiet indented row with a full-width divider. Only the image/name/status
control and shared Galaxy Actions button are interactive; both open one shared
`ActionPopover`. The selected site's ID and coordinates live in the Galaxy URL,
so Briefing links and reloads open the same details. Busy and completed sites
remain visible, with dispatch disabled. `GalaxyActionsTrigger` is also used by
ordinary planet rows, preserving their exact desktop/mobile Actions control.
