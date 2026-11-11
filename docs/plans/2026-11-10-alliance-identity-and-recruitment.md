# Alliance identity, Hall, and public recruitment

Status: implementation and local integration/visual validation complete;
not deployed. See the [verification record](../verification/alliance-presentation.md)
and the
[data, media, and UI contracts](2026-11-10-alliance-presentation-contracts.md).

Implementation branch: `emick/alliance-identity-recruitment`, created from
`emick/fix-loading-animation` at `3b00c406`, then aligned with its tree-identical
merged commit `ea180d7f` (PR #386). Do not modify its working checkout.

## Product objective

An alliance should feel like a home its members made together. Its public page
should make members proud to share it, introduce unfamiliar visitors to Orbit
Imperium, and carry their chosen alliance into their first moments in the game.
One alliance identity connects the public page, Hall, discovery, affiliation
displays, and shared-link previews.

## Agreed decisions

- All alliance customization tools and uploads are free. Access does not depend
  on a leader's or member's supporter subscription. Personal supporter features
  remain a separate concern.
- The alliance owns its identity and uploaded assets; leadership or membership
  changes do not remove them. Management uses the existing delegated permission
  model, with server enforcement.
- Clicking Alliance opens the Hall directly. The Hall is the alliance's landing
  page and integrates the noticeboard. Keep Orbit navigation initially.
  Members, Applications, Settings, and Audit remain compact management views.
- Omit the top planet/universe/player strip throughout the alliance area. Retain
  navigation; alliance identity supplies the relevant context. Owner accepted
  the visual studies with this correction before implementation.
- Support still images and animated GIF/WebP uploads. Preserve animation, impose
  sensible limits, and provide still-image behavior for reduced motion. Artwork
  must support desktop/mobile cropping and positioning.
- Public pages use three authored templates: Flagship (cinematic invitation),
  Transmission (typographic recruitment letter), and Citadel (multi-section
  showcase with gallery). These are distinct layouts sharing the alliance's
  identity and Orbit's join/apply behavior.
- Templates define their own editorial fields. Store versioned, validated
  authored content in PostgreSQL JSONB so fields can evolve per template.
- Editorial fields support Markdown and automatically link typed URLs. Alliances
  may link to Discord, websites, and external application processes. Retain
  the existing raw-HTML prohibition and safe link schemes. An outbound-link
  notice is an optional later refinement, not an approved-domain restriction.
- Authoring is ordinary form fields with Preview and Save changes. Preview
  renders the complete selected template with unsaved edits using the real page
  renderer, in a simple fullscreen overlay or new tab. No WYSIWYG editor,
  persistent drafts, separate publishing workflow, or elaborate preview tooling.
- Public links do not grant admission. Open alliances allow joining;
  Application alliances require submission and approval. Closed alliances still
  have public pages. Existing recruitment and universe rules remain authoritative.
- For new players arriving through recruitment, insert the join/apply exchange
  into the orb-led arrival scene after title, planet appearance, and planet name,
  before its farewell. Show the chosen alliance and allow joining/applying there.
  Preserve destination through account creation and enrollment. Do not make the
  player rediscover the alliance. Pending applicants can continue playing.

## Implementation defaults

These fill in ordinary implementation details; they are not additional owner
decisions or commitments to extra features.

- Keep common identity separate from template-specific prose: crest, motto,
  palette, and artwork selections have one authoritative source. Reuse the
  existing insignia composition approach where it fits alliance identity.
- Start the Hall with one strong layout: alliance identity, artwork, a private
  welcome, and the existing noticeboard. Public template choice does not require
  three corresponding private Hall layouts.
- Public and private prose remain explicitly separate. Never copy the private
  welcome, noticeboard, roster, applications, or member activity into public
  projections or previews.
- Use existing EditProfile authority for identity and presentation unless source
  inspection establishes a need for a more specific delegated permission.
  ManageRecruitment continues to govern recruitment rules and invitation links.
- Offer template prompts such as hero introduction, story, recruitment, and
  community links, with optional sections omitted cleanly. Exact field names and
  composition are part of visual design, not a generic form-builder project.
- Preserve authored content when switching templates. Do not silently discard
  fields that a new template does not display. Store authored source and asset
  references, never rendered HTML, computed counts, or effective permissions.
- Keep Orbit's primary join/apply action recognizable and include a concise
  game introduction and Unbought Games attribution. Alliance-authored external
  application instructions can coexist with the normal admission flow.
- Existing players receive direct joining options without replaying arrival.
  Offer a Not now action. Skipping the narrative should not silently lose the
  alliance destination. Handle changed recruitment, unavailable alliances,
  existing membership, and already-pending applications using current facts.
- Reuse the existing asset-store abstraction where suitable. Establish bounded
  upload decoding, animation/frame limits, ownership, delivery, and lifecycle
  handling before exposing uploads. Numeric budgets are implementation choices.
- Follow ADR 002 and the customization operator guide. Free alliance tools do
  not authorize copying separately distributed supporter originals into public
  code, fixtures, or anonymous media endpoints. Use freely licensed defaults
  and alliance-owned uploads; keep self-hosting supported.

## Work breakdown and dependencies

1. **Visual direction and contracts.** Define the shared identity, each
   template's fields, asset slots, and public/private boundaries. Design the
   three public compositions, Hall, editor, and arrival exchange against existing
   game components. Review desktop/mobile designs before multiplying layouts.
2. **Identity and media foundation.** Implement schema, domain commands,
   permissions, JSONB validation/versioning, asset upload/delivery, and public
   projections. Keep handlers thin and preserve transactional/retry semantics.
3. **Public templates and editor.** Build all three responsive templates, safe
   Markdown autolinking, template fields, artwork controls, full-page preview,
   and save/conflict/error behavior. Update shared-link presentation to reflect
   the published identity without exposing private content.
4. **Hall and identity integration.** Make Hall the default alliance destination,
   integrate notices and private welcome, retain efficient management tabs, and
   carry identity into discovery and affiliation surfaces where appropriate.
5. **Arrival recruitment.** Carry recruitment context into the orb sequence;
   join or apply there, show the result, and continue to the briefing. Keep the
   existing-player path direct and preserve explicit admission actions.
6. **Integration and validation.** One integration owner coordinates contracts,
   migrations, delivery, documentation, and validation. Follow test-design and
   UI-design skills; serialize expensive shared-machine checks. Capture and
   inspect final desktop/mobile states and display them in the implementation
   chat. Record exact revisions, failures, timing, and cleanup.

Contracts from workstream 1 unblock workstreams 2–5. Public templates and Hall
share identity and media contracts; arrival depends on recruitment context and
existing membership commands, not on completion of every template. Agree file
ownership before any parallel implementation. This document does not dispatch
new chats or agents.

## Deliberately later

- A separate immersive shell that hides Orbit navigation.
- Simulated ship arrivals, a spatial headquarters, and a live activity spectacle.
- New member-joined notifications or automated social outreach.
- Personal player uploads, alliance subscriptions, sponsorship, and paid boosts.
- Arbitrary HTML/CSS/scripts, embedded forms, a freeform page builder, or a
  general-purpose rich editing/publishing platform.
- Public rosters, featured commanders, or achievement showcases without a
  separately defined publication model.

## Existing foundations inspected

- `docs/features/alliances.md`: admission, permissions, public projections,
  invitations, and private membership boundaries.
- `apps/web/src/features/alliances/public-page.tsx`: current public page.
- `apps/web/src/features/alliances/markdown.ts`: HTML disabled, explicit link
  schemes, and currently disabled autolinking.
- `apps/web/src/features/arrival/arrival-scene.tsx`: current orb sequence.
- `apps/web/src/client-model/use-recruitment-entry.ts`: existing enrollment and
  alliance welcome destination.
- `docs/architecture/adr-002-hosted-cosmetic-content.md` and
  `docs/operations/empire-customization.md`: content and delivery boundaries.
