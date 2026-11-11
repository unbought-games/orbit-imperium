# Alliance presentation: data, media, and UI contracts

Status: implemented design record. The generated OpenAPI contract and source
registry are authoritative. The original proposal below records the reasoning;
implementation adjustments are listed here.

- Uploads reserve through the media POST action and transfer/finalize through one
  bounded PUT. A separate browser completion request is unnecessary. An internal
  preparation transaction reserves actual processed bytes before the blob write.
- Media placements use `media_id` and integer `x`/`y` percentages, with optional
  mobile percentages. Default bundled artwork is a display fallback, not a stored
  catalog-media copy.
- Existing name/tag/public introduction edits retain their existing Profile save;
  visual identity, Hall, and template edits use the atomic SavePresentation action.
- Existing globally unique alliance FKs own the presentation rows. Media lifecycle
  records deliberately survive alliance deletion; transactions and public reads
  enforce their universe/epoch ownership.
- The native image pipeline uses a 64-megapixel total animation-work ceiling.
  Operator-configurable upload budgets are documented in the operator guide.
- Public free-symbol display uses raster rendering while catalog originals retain
  their existing delivery policy. Two independently authored free stripe masks
  make the default alliance composer complete.

See [the operator guide](../operations/alliance-customization.md) for actual
configuration, cleanup, backup, and compatibility behavior.

## Design direction

Keep Orbit's navy surfaces, champagne actions, ice links, serif editorial
headings, and existing controls. Give the Hall and public templates a deliberate
artwork region. Keep management screens quiet: compact identity header, aligned
rows, tabular numbers, separators, and secondary row actions in menus. Confirm
destructive actions at execution, rather than making them permanent visual
competitors. Never hide the primary task in a menu.

Keep Orbit navigation in the Hall. Replace Board with Hall as the default
destination; the existing composer and pinned-first notices live underneath the
alliance welcome. Omit the top planet/universe/player strip throughout the
alliance area, per owner review; keep the alliance context in its own identity
header. Do not introduce another nested sidebar. On phones, put the
alliance identity and current action before lengthy artwork, retain touch-sized
controls, and allow tabs to scroll without making the entire page overflow.

Public templates have different compositions, not different admission behavior:

| Template     | Composition                                               | Template-specific authored fields                                                                  |
| ------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Flagship     | Cinematic hero, invitation, story and recruitment below   | Hero Markdown, recruitment heading/Markdown, community Markdown, hero media placement              |
| Transmission | Editorial letter with a quiet identity rail               | Letter heading/Markdown, signature text, community Markdown, optional image placement              |
| Citadel      | Alliance showcase with a prominent invitation and gallery | Hero Markdown, ordered bounded editorial sections, gallery placements/captions, community Markdown |

All have shared identity, real recruitment status, game introduction, primary
join/apply action, and Unbought Games footer. The existing public introduction is
available as a shared section/default; each template decides where it belongs.
Defaults look intentional without uploaded art or filled optional sections.
Section titles are authored; placeholders are editor prompts, never public copy.

The editor uses horizontal sections: Identity, Hall, Public page, and Media within
presentation settings. Recruitment rules and leadership remain separate. Public
page editing offers template selection, that template's ordinary fields, Preview,
and Save changes. Preview is a focus-managed fullscreen dialog rendering unsaved
form values. Closing it restores the editor and focus. It does not create a
public draft URL, persist content, or need a separate preview server. Template
selection preserves unsaved edits in the current editor session as well as saved
documents for other templates.

Sources consulted for principles, not an instruction to adopt another UI kit:

- [Stripe Apps design](https://docs.stripe.com/stripe-apps/design): consistent
  components and constrained branding preserve usability and accessibility.
- [OpenAI UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines):
  restrained visual hierarchy, system spacing, accessible type and contrast,
  and focused use of expanded views. These are plugin guidelines, not a claim
  to have obtained OpenAI's internal product design system.
- The repository UI guide and the November 10 Alliance desktop/mobile captures.

## Authoritative data

Do not turn the alliance into one opaque JSON document. Keep relational identity,
membership, permissions, admission, and retry receipts as they are. JSONB owns
the extensible authored presentation, not business rules or computed values.

Proposed tables (names provisional; no migration number reserved):

| Table                         | Key and source fields                                                                                                                                  | Responsibility                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `alliances` (existing)        | Existing ID/universe/epoch, name, tag, public_text, revision, recruitment, preferences                                                                 | Existing authoritative identity/admission; public_text stays the single shared About Markdown source |
| `alliance_presentation`       | Alliance FK; schema_version; identity JSONB; hall JSONB; active_template text                                                                          | Shared crest/motto/palette/media placements; private welcome/layout; explicit selected template      |
| `alliance_template_documents` | Composite alliance FK + template_id; schema_version; content JSONB                                                                                     | One saved authored document per template, retained when another template is selected                 |
| `alliance_media`              | Media UUID; universe/epoch/alliance ownership; uploader; upload intent ID; state; accepted immutable object receipt; created_at, expires_at/deleted_at | Ownership and upload/deletion workflow; never a public storage URL                                   |

Use composite ownership FKs to prevent cross-universe/epoch attachment. JSONB
checks bound object shape and byte size; application/domain validators enforce
template versions, known fields, enum values, text length, and media placement
types. Do not use a PostgreSQL enum for template IDs. A new application template
usually adds a registry entry, renderer, validator, and migration function, not
a database column or schema migration.

Keep `public_text` authoritative while old callers exist. New editor saves it
through the same source path; template documents must not keep a synchronized
copy of it. Template-specific prose is separately authored content, not a second
biography automatically copied on save. If that legacy field later moves, use a
deliberate one-time migration and compatibility projection, never dual writes.

Use the existing alliance command ID, expected revision, subsystem lock, and
receipt semantics for presentation saves. Save shared fields, the edited template,
and active-template selection atomically when the UI submits them together.
This initially shares the alliance revision with notices/membership. A competing
change returns conflict while preserving editor inputs; no last-write-wins.
Avoid introducing independent revision coordination before there is evidence
that conflicts require it. Upload transfer itself does not hold the social lock.

### Example persisted presentation

```json
{
  "schema_version": 1,
  "active_template": "flagship",
  "identity": {
    "motto": "Good company. Uncharted space.",
    "palette": { "primary": "#cbb68d", "secondary": "#a4dbef" },
    "crest": {
      "kind": "composition",
      "recipe": {
        "version": 2,
        "symbol": "compass",
        "foreground": "#cbb68d",
        "background": "#152b40",
        "layers": [],
        "shape": "shield"
      }
    },
    "banner": {
      "source": {
        "kind": "upload",
        "media_id": "22222222-2222-4222-8222-222222222222"
      },
      "focal_point": { "x": 0.65, "y": 0.45 },
      "mobile_focal_point": { "x": 0.75, "y": 0.45 },
      "alt": "Our station above an amber world"
    }
  },
  "hall": {
    "layout": "standard",
    "welcome_markdown": "Welcome home. Read our pinned flight plan before launching.",
    "background": null
  }
}
```

The template document is a separate row:

```json
{
  "template_id": "flagship",
  "schema_version": 1,
  "content": {
    "hero_markdown": "Build something worth coming home to.",
    "recruitment_heading": "A place for your kind of commander",
    "recruitment_markdown": "New commanders welcome. Learn and explore together.",
    "community_markdown": "Meet us on [Discord](https://discord.com/).",
    "hero_media": null
  }
}
```

Null hero media means use the shared banner; do not persist the resolved copy.
Motto and names are plain identity text; editorial areas support Markdown.
Colors affect approved accents and artwork treatments, never arbitrary CSS,
body-text contrast, critical states, or resource colors.

### Expansion and compatibility

- A template registry defines stable ID, version, field definitions, limits,
  default composition, explicit migration, and referenced-media traversal.
  Share definitions through generated contracts/JSON Schema; do not independently
  hand-maintain TypeScript and Rust field lists. Renderers remain normal code.
- Retain every saved template document. Selecting another template changes one
  selected ID; returning restores its fields. The editor edits only the chosen
  document, not an opaque replacement of all saved templates.
- Older clients cannot erase fields they do not understand. Versioned scoped
  writes reject unsupported schema versions; never accept a lossy read-modify-write.
- A server that lacks an installed template retains its document and selects a
  free presentation fallback for display. It must not overwrite that selection
  or permit editing unknown content. Deployment preflight must reject unsupported
  stored schema versions when no safe reader exists; rolling rollback support
  requires version-aware readers, not hopeful deserialization.
- Self-hosters can extend the open-source registry/renderers and install their
  own free assets without Unbought infrastructure. Configuration-only arbitrary
  template execution is not part of the first release.
- If an unknown retained document prevents determining media references, refuse
  ordinary library deletion rather than guessing that its assets are unused.
  Explicit alliance deletion can still remove the entire owned collection.
- Alliance lifecycle remains universe/epoch scoped. Durable cross-season guilds
  would be a separate domain decision. Reusable media/document types allow a
  future export/import or archive without pretending that behavior exists today.

## Media workflow and storage port

Current `AssetStore` has only `read`/`write`, both using whole `Vec<u8>` objects;
the `BlobStore` implementation caps each at 1 MiB. It has working filesystem and
S3-compatible adapters, but is not yet a general upload API. Do not globally
raise the limit and unintentionally broaden catalog/SVG readers.

Add a bounded media-storage interface implemented by the same configured backend.
Keep the current small-asset calls and their bounds. The new interface supports
create-if-absent immutable writes, bounded reads/streaming, metadata/head, and
idempotent deletion. Keys are server-generated. Backend errors distinguish
not-found, size-limit, content conflict, and transient unavailable.

Store media references as UUIDs. Resolve object keys, delivery URLs, permission,
and current display rendition above storage. Suggested namespace:
`alliance-media/v1/{universe}/{epoch}/{alliance}/{media-id}/original`.
The accepted object receipt records the immutable checksum, content type, and
stored byte length as upload facts for verification/accounting. Derive usage
totals from accepted objects/reservations; do not store an alliance usage counter.
Derive image dimensions, animation characteristics, responsive URLs, posters, and
other renditions from the accepted content. Any later rendition cache must be
discardable and keyed by source checksum plus transformation version; it must
never become an independent source of truth or require a DB variant manifest.

### Upload sequence

1. Reserve a media ID through an authenticated, CSRF-protected request. Check
   current membership/EditProfile, epoch, declared bytes, and capacity under a
   short transaction. The upload intent is idempotent. Reserve against the
   per-alliance budget so concurrent uploads cannot overrun it.
2. Stream bounded bytes through the Orbit API into a bounded local spool, without
   holding the alliance transaction. Inspect actual encoding and decode under
   pixel/frame/work limits. Accept JPEG, PNG, GIF, and WebP; preserve GIF/WebP
   animation. Reject executable uploads and unsupported files clearly.
3. Write accepted bytes to the immutable server-generated key. Do not expose
   raw filenames as paths or fetch external image URLs. Originals are private
   inputs; public display uses safe decoded output with unneeded metadata removed.
4. Recheck current permission/ownership/epoch and commit the accepted object
   receipt. A revoked role during transfer cannot publish or attach the upload.
   Blob I/O stays outside the social lock. A failed finalization leaves the
   reserved record available for retry or cleanup, not a half-published image.
5. The editor receives a stable ready media ID, previews through an authenticated
   media route, and attaches it with the normal presentation save. Uploading does
   not change the public page. Repeated finalization returns the same result.

No direct-to-S3 upload is required initially. Both local disk and S3 use the same
API and UI. A later direct-upload implementation can replace the transfer step
behind a discriminated upload target while preserving media IDs, validation,
finalization, and document references. Never make S3 presigning mandatory.

Proposed starting budgets, configurable and returned as server capabilities:
20 MiB per file, 4096 px maximum side, 16 megapixels per frame, 300 frames,
256 megapixels total decoded frame work, 50 live assets and 200 MiB per alliance.
These are initial engineering values to verify with representative assets before
shipping; they are not hard-coded product entitlements. Explain actual rejection
reasons. Bound concurrent processing and output bytes as well as input size.
Self-hosters may tune within supported safety limits or disable new uploads;
already-saved identity must still render.

### Visibility, deletion, and failure recovery

- Unattached and inactive-template-only uploads are private to authorized editors.
  Hall-only artwork is accessible to current alliance members, not anonymous
  visitors. Public identity and currently selected public-template references
  make their assets publicly displayable. Derive visibility from live references,
  never a persisted `is_public` flag. Publishing a Hall image publicly explains
  that reuse in the editor.
- Anonymous routes must verify active public reachability, not just possession
  of a UUID. Authenticated routes check membership/editor rights. Public DTOs
  omit private documents, unused templates, originals, and upload metadata.
- Once shown publicly an image can be copied; removal revokes future origin
  access, not downloaded copies. Initially use revalidated public delivery and
  private/no-store member delivery. Avoid immutable public cache headers on
  revocable media. Generated link previews follow the same visibility rules.
- Deleting an asset checks references across all saved templates, shared identity,
  and Hall under the same lock as attachment. Report where it is used; require
  replacement/detachment first. Do not persist an inverse usage index.
- A deletion tombstone makes an asset unattachable immediately. Delete its blobs
  after the transaction; retry idempotently after storage failures. Cleanup claims
  expired reservations before deleting, and finalization refuses claimed or
  expired reservations, so an in-flight upload cannot resurrect deleted media.
  Keep a terminal tombstone long enough for command replay and late I/O recovery;
  a late write after lease loss must be deleted by its handler or a subsequent
  tombstone reconciliation pass.
- Disband/reset queues owned keys for deletion before cascading live records.
  Cleanup records must survive the owning alliance's deletion. Implement a small
  DB-backed cleanup operation in existing operator/maintenance tooling; no new
  scheduler or independent media service is required.
- Reserve IDs in the DB before writing blobs so cleanup can enumerate known keys
  without requiring a bucket-wide listing. Back up DB and asset storage together.
  A lost blob produces a visual fallback plus an operator-visible error; never
  erase the saved selection. Local single-host storage needs its mounted volume;
  multi-host deployments use shared S3-compatible storage.
- Extend hosted permissions to the new prefix and deletion operation explicitly.
  Validate local and S3 parity; do not assume existing insignia-only IAM allows it.

## Interfaces to settle before delegation

These are proposed wire shapes, using existing protocol/auth conventions:

| Surface                | Contract                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public alliance GET    | Existing summary/public_text plus negotiated `presentation` containing resolved public identity and only the active template document             |
| Private alliance query | Member Hall projection; editor-only presentation documents/library capabilities, omitted without permission                                       |
| Template catalog query | Stable template IDs/versions and typed field definitions/limits; includes media capabilities; no supporter content originals                      |
| Presentation command   | Existing command ID and expected alliance revision; scoped shared/Hall/template changes and optional active-template selection in one transaction |
| Begin media upload     | Universe/alliance binding, intent ID, filename for display only, declared size/type; returns media ID, expiry, bounded transfer target            |
| Transfer/finalize      | Server-identified upload, bounded byte stream, immutable checksum; returns ready media descriptor or explicit retryable/permanent failure         |
| Remove media command   | Media ID plus idempotent command envelope; refuses live references, writes tombstone before blob deletion                                         |
| Display media GET      | Media ID and approved rendition name; server resolves access, content type, encoding, and bounded output                                          |

Negotiate new fields using the repository's existing capability-header pattern.
Old clients retain existing projections; old writers cannot replace the new JSON.
Old servers return an unavailable-feature state rather than letting the client
assume upload support. Update OpenAPI and regenerate frontend types together.
Do not persist API URLs, rendered Markdown, public DTOs, or derived membership.

Representative interface shapes (design notation, not a second implementation
of generated contracts):

```ts
type MediaSource =
  | { kind: 'upload'; media_id: UUID }
  | { kind: 'catalog'; asset_id: string }

type MediaPlacement = {
  source: MediaSource
  focal_point: { x: number; y: number } // normalized 0–1
  mobile_focal_point?: { x: number; y: number }
  alt: string
}

type PresentationEdit =
  | { type: 'SetIdentity'; schema_version: 1; value: AllianceVisualIdentity }
  | { type: 'SetHall'; schema_version: 1; value: AllianceHallContent }
  | {
      type: 'SetTemplateDocument'
      template_id: string
      schema_version: number
      content: JsonObject // validated by the registered template schema
    }
  | { type: 'SelectTemplate'; template_id: string }

type SavePresentation = {
  type: 'SavePresentation'
  alliance: UUID
  edits: PresentationEdit[]
  profile?: { name?: string; tag?: string; public_text?: string }
  // Outer existing command envelope supplies command_id, expected_revision,
  // and authenticated universe/player binding.
}

type UploadTarget = {
  kind: 'orbit'
  method: 'PUT'
  path: string
  max_bytes: number
  expires_at: number
}

type BeginUploadResult = {
  media_id: UUID
  target: UploadTarget
  // A future direct-upload target is another tagged variant, not a new media ID.
}

type PublicPresentation = {
  schema_version: 1
  identity: PublicAllianceVisualIdentity
  template: { id: string; schema_version: number; content: JsonObject }
  media: Record<UUID, ResolvedDisplayMedia>
  // Only active public references; this map is derived for the response.
}
```

An omitted edit is unchanged. A null value removes only an explicitly nullable
field. Reject duplicate edits to the same document in one command. Validate all
edits against the resulting aggregate before committing, so selection can refer
to a document created in that same save. Start with an 8 KiB identity payload,
16 KiB Hall payload, and 32 KiB per template; retain the existing 128 KiB command
envelope bound. Bound sections/gallery entries independently of byte size.

Proposed upload routes under `/api/v4/universes/{u}/alliances/media`:
`POST /uploads`, `PUT /uploads/{media}/content`, and
`POST /uploads/{media}/complete`. Reservation and completion take the existing
bound request context. The raw transfer route authenticates the same account,
checks Origin/CSRF and its reserved lease, and cannot accept a caller-selected
storage key. Transfer records verified content after its blob write; completion
rechecks authority before changing the record to ready. Neither state change
publishes the image. The route limit is per-upload, not a global API body-limit
increase.

Use existing problem responses with stable detail codes for
`unsupported_template_version`, `invalid_field`, `revision_conflict`,
`upload_expired`, `unsupported_media`, `media_limit_exceeded`, `media_in_use`, and
`storage_unavailable`. Keep normal not-found masking for unauthorized resources;
return field paths and usage locations only to authorized editors. Storage
unavailability is retryable; invalid content is not. Failed saves preserve local
form edits and successful uploads, rather than restarting the whole workflow.

### Arrival interface

Parse the existing `{universe, alliance, invitation?}` recruitment context once
at game entry and pass it into ArrivalScene before the shell's early return.
Retain it through signup, enrollment, canonical route redirects, and reload.
Where enrollment persists arrival source facts, add the selected alliance
destination there so closing a tab or changing device can resume it; do not
store a copy of the alliance profile or admission status. Local and hosted
enrollment must take the same optional typed context and validate the destination.

After naming the world, read current public identity and the player's actual
membership/application state. Reuse existing Join/Apply commands and retry IDs.
Do not bundle admission with arrival completion or call it automatically from
a route effect. Join/application failure retains the message and lets the player
retry or continue. Successful admission remains successful if saving arrival
later fails. Not now is an explicit dismissal fact, not fake membership state.
Existing players skip the narrative and use the same admission component.

## Validation contract

- Pure/model: schema versions, field limits, template defaults/migration,
  reference traversal, Markdown links, rendition selection, and arrival choices.
- Database/HTTP: delegate permissions and ownership, role revocation during
  transfer, concurrent quota reservations, attachment/deletion races, exact retry,
  failed blob finalization, public/private reachability, reset/disband cleanup,
  old-client writes, and inactive-template preservation.
- Adapter contract: identical bounded read/write/delete behavior for a temporary
  local store and an S3-compatible test endpoint; failure injection is explicit.
- Component: template switching, unsaved preview, keyboard/focus, upload errors,
  long content, mobile layout, reduced motion, and normal menu/confirmation use.
- Short application journeys: recruitment destination reaches the arrival step;
  editor saves and public page renders the result. Actual hosted signup and
  recovery remain explicit acceptance, not additions to the routine browser gate.
- Inspect desktop/mobile Hall, editor, all three templates, and arrival states
  in the running implementation. Sketch captures are design evidence only.

## Outstanding implementation investigations

No owner decision blocks this proposal. Before shipping, verify bounded animated
codec support and rendition cost, choose final upload budgets from measurements,
and inspect both enrollment backends for durable recruitment context. Confirm
media deletion/backup permissions and migration compatibility in deployment
preparation. These are delivery work, not evidence that uploads or contracts are
already implemented.
