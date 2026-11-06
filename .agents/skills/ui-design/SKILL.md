---
name: ui-design
description: Design, implement, review, and fix Orbit Imperium UI. Use for screen layouts, visual styling, UI copy, controls, responsive behavior, interaction states, and animation, including small UI cleanup requests. Excludes backend-only changes with no user-interface impact.
---

# UI design

Before UI work, read the [design guide](../../../apps/web/src/ui/README.md) and
applicable [AGENTS.md](../../../AGENTS.md). The guide owns design principles;
follow its component links only as needed for the current change.

## Work from the rendered interface

Inspect the current screen and the interaction being changed before editing.
When the user says to look at the screen or try a behavior, view the rendered
pixels and perform that interaction; a DOM snapshot alone is insufficient.
For a new screen, inspect the nearest existing pattern.

Identify the player's task, the information needed at a glance, and the component
that owns the presentation. Preserve the requested scope and the game's visual
language. Keep shared design decisions in their owning components; keep feature
layout local. Avoid accumulating exceptions against another component's markup.

## Verify the result

Exercise the changed flow in the running app, including relevant transitions and
loading, empty, error, focus, and touch states. For every UX change, capture
screenshots of the changed screen and relevant states at desktop and mobile
sizes, then look at the images. Ask: Does it look correct? Does it look good?
What is wrong, and what could be better? Check alignment, sizing, hierarchy,
spacing, readability, and clarity in context—not just the edited element.
Fix visible defects and capture fresh screenshots after the final adjustment.
Use focused tests for behavior; they do not establish visual quality.

Follow AGENTS.md for screenshot capture and delivery. Respect explicit user
overrides; if they prevent visual verification, state what remains unverified.
Report what changed and what was actually checked. Do not claim a preview is
visually correct from a successful build, CSS inspection, or hot reload alone.
