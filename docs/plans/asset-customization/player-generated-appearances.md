# Player-generated appearances

Date: 2026-11-16. **Status: agreed product boundaries, implementation proposal;
not a live feature.** This is W7 of the [asset customization plan](README.md).
It does not block the free authored-skin end-to-end slice.

## Product boundary

Prepared collection skins support complete local recoloring with no AI charge.
A player can separately ask AI to create a new appearance, either starting from
an owned/authored design or from a class-bound creative prompt. The image model
gets the player's instructions, eligible selected cosmetics and concise target
constraints. It can interpret unusual shapes without turning our application
into a procedural ship designer. The image has no gameplay effect.

Each delivered generated revision is an immutable, account-owned appearance for
one ship class, reusable across universes after membership expires. Later edits
create new paid generations; previous owned revisions remain available. Switching
or equipping an owned revision is free. The player can branch from an earlier
revision and retain the parent relationship.

A generated image does **not** get automatic paint masks or deterministic color
controls. Color/emblem/shape edits to it require a new AI render. The product must
make this boundary apparent before the player spends currency. The curated offline
workflow may separately adopt an image as a new authored skin if commissioned;
that is not included with an ordinary player render.

Arbitrary player image uploads are excluded from this product. Use published
collection art, owned prior outputs and approved cosmetic references. Internal
creative-authoring uploads are a different trust boundary.

## Spending decisions

“Render credits” is a working term for the requested limited currency, not a
chosen currency name or implemented balance. Do not assume Renown, membership,
a cosmetic grant or an existing account observation is a spendable render balance.
A generation consumes its quoted allowance; equipping and aesthetic approval do
not determine the charge. Disliking a successful generation does not refund it.
Trying another revision incurs another quoted generation cost.

The following remain open before live spending:

- Currency owner/ledger authority (Accounts, Orbit, or a defined service contract),
  acquisition, grants, membership allowance, purchase options and expiry.
- Whether a credit has fixed value across providers/models/resolution, or jobs
  quote varying credit amounts. No historic “cents per image” estimate is a budget.
- Charge/refund policy for provider failures, unusable/moderated outputs, user
  cancellation, partial results and ambiguous provider completion.
- Job concurrency, per-account allowance, deployment/global spend caps, storage
  limits and supported output sizes.

Earlier chat recommendations about refunding failed renders were not explicitly
accepted. Do not silently implement either blanket refunds or charging every
failed request as settled policy. Record the provider cost independently from the
player credit outcome so the chosen policy cannot conceal actual spend.

## Proposed durable job flow

1. Resolve the authenticated owner and target. Validate request shape, authorized
   cosmetic references, owned parent image and allowed source assets. Apply prompt
   preflight and current service availability before calling a provider.
2. Present a concrete quote and what one generation delivers. An explicit Render
   action accepts that quote; changing primary/accent in the free editor never
   submits a paid job. No provider calls on hover, slider movement or page opening.
3. Atomically reserve the accepted currency amount and a bounded provider-cost
   budget under a durable client request ID. Concurrent requests cannot overspend.
   Reusing an ID with different request content is rejected.
4. Persist immutable job inputs and queue the job. A worker claims it with a lease
   and records provider submission/operation identity. Do not hold a DB transaction
   or connection while waiting for inference.
5. Reconcile completion, validate/decode the output and required presentation
   constraints, process derivative sizes, and write immutable media with receipts.
   Validate both input and output for prohibited imagery and gross class violations;
   a text prompt can request harmful symbols even without uploads.
6. Commit the generated revision and settle its credit reservation according to
   the accepted policy. Media ownership and its receipt must survive editor closure.
   Do not make a final Save click the only way to retain an already paid result.
7. Notify/poll through the job status projection. Let the player compare, equip,
   return to an owned revision, or explicitly request another paid generation.

Suggested states distinguish queued/reserved, submitted, reconciling, processing,
succeeded, failed, canceled and rejected. Exact enums belong to the implementation.
If a provider times out after submission, do not assume it failed and send another
billable request. Query/reconcile the recorded operation or expose a recoverable
uncertain state. Deduplicate callbacks and worker retries; never charge twice or
write two owned revisions for the same accepted job. Cancellation is capability-
and state-dependent, not a guaranteed provider refund.

A deployment-level budget/circuit breaker is necessary even when each account has
credits: credits alone do not bound the operator's real provider spend. Failure of
this optional feature must not block ordinary gameplay or authored recoloring.
Self-hosters can leave generation disabled or configure their own supported provider;
no hidden dependency on official services should be introduced.

## Proposed authoritative records

| Record                        | Contents/responsibility                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generation request/job        | Owner, target, accepted quote/policy version, idempotency key, immutable intent, selected references, parent revision, prompt/template versions, provider routing, operation ID and lifecycle receipts |
| Currency ledger/reservation   | One spending authority; grant/reserve/settle/release facts with unique source keys and reconciliation; do not duplicate a synchronized balance in multiple services                                    |
| Provider cost record          | Actual/reported or explicitly estimated usage and real cost, keyed to provider operation; retained independently from charge/refund policy                                                             |
| Generated appearance revision | Owner, target, immutable media hashes/variants, parent reference, prompt/reference provenance, accepted job receipt and visibility/governance state                                                    |
| Empire equipment              | Same compatible appearance-selection boundary as authored designs; references owned generated revision                                                                                                 |

Ownership is independent of membership used to obtain credits and of later dye
eligibility. A permanently owned generated image retains its baked appearance
when membership expires; reopening it must not secretly rerun restricted-dye
checks and erase the image. New generations use the applicable current creation
rules. Unavailability/takedown is a distinct governed media state with retained
receipts, not routine entitlement expiry.

Do not duplicate rendered appearance into gameplay fleet rows. Media is immutable
output, while inventory/selection is authoritative account/empire data. Keep stored
prompts/provider payloads out of public player projections and logs where they
would disclose private content or credentials.

## Provider boundary

Define a game-level request independently of any vendor SDK:

- Target kind/ID and concise class brief, style/orientation/framing constraints.
- Player instruction and approved references, with explicit reference roles.
- Current selected dye/emblem references and their validated resolved inputs.
- Parent generated revision or authored skin revision, when present.
- Requested dimensions/alpha/output class, model capability needs and cost ceiling.
- Intent/request ID and versioned internal prompt policy.

Adapters translate to supported provider operations and normalize output, usage,
operation IDs, errors and status. Treat transparency, editing fidelity, multi-image
inputs, asynchronous completion, cancellation and provider idempotency as declared
capabilities. Do not assume every provider supports them equally. Retain routing,
model and template versions for provenance; swapping providers must not invalidate
old owned images. A deliberately requested multi-pass workflow quotes/reserves its
whole cost; retries do not silently add new paid creative passes.

This document selects no provider, price or API model. Verify current provider
capabilities and terms during implementation rather than coding against chat-era
assumptions. Credentials remain server-side. The application owns permissions,
quotas and job accounting; a provider adapter must not decide cosmetic entitlement.

## UX and open creative-policy decisions

The generation branch should resemble an illustrated conversation: describe,
render at a visible cost, inspect, compare, then continue from a selected revision.
Keep draft instructions separate from accepted immutable job inputs. Leaving the
hangar does not lose paid work. Equip stays a separate free action with a clear
current-equipment indicator.

Before exposing generation, resolve these decisions with the owner:

- Do selected authorized dyes/emblems override contradictory prose? This was the
  last unanswered question in “Design ship customization flow.” Recommended: make
  structured selections authoritative, but acknowledge that exact pixel-level
  color enforcement by a generative model is not guaranteed.
- How much palette variation may the model introduce through material, shading,
  decorations or requested shapes without defeating cosmetic unlocks?
- What are the minimum class cues for each target, and how are unusual valid
  designs distinguished from gross violations without requiring a rigid silhouette?
- Who may view generated appearances in each game surface, how do reports preserve
  event-time references, and what are the report/removal/retention policies?
- What happens to generated revisions when the owner deletes one, its parent,
  their account or an empire? Permanent ownership must not be undermined by
  casual cleanup of a referenced parent image; intentional deletion needs a
  deliberate retention/reference policy.

Safety/class checks should enforce the stated boundaries without replacing the
model with a large handcrafted shape taxonomy. No gameplay advantage can come
from looking larger, carrying extra drawn weapons or implying different stats.

## Delivery and acceptance

Build the backend job/ledger/provider boundary with deterministic fake-provider
fixtures before enabling billable calls. Test duplicate submissions, concurrent
spends, delayed callbacks, worker crash, ambiguous submission, output rejection,
media-write failure, settlement retries, ownership/access, and recovery after a
closed browser. Use the cheapest meaningful boundary per the test-design skill.

An explicitly authorized bounded live trial then verifies the chosen provider's
quality, latency, usage reporting and output handling. Mocked success cannot
prove actual provider cost behavior. Record the precise tested models/revisions,
spend limits and cleanup; do not publish an unlimited public endpoint from a spike.

Done means a quoted job charges/settles once under the chosen policy, persists a
permanently owned class-bound revision, can be freely equipped across universes,
and supports another explicitly paid edit without affecting the free deterministic
path. Documentation alone, a provider API demo, or a local image on disk is not
that end-to-end acceptance.
