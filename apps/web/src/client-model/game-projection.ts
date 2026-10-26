import type { components } from '../contracts'
import {
  canonical,
  attemptKey,
  sameBinding,
  type Attempt,
  type BoundProgressionOptions,
  type BoundQuote,
  type BoundView,
  type Command,
  type Quote,
} from './commands'
import type { GameState } from './game-store'
import { rawResourceRates } from './production-rates'
import { canAfford, resourceNames } from './resources'

type S = components['schemas']
export type SubmittedQuote =
  | BoundProgressionOptions
  | BoundQuote
  | Quote
  | S['FleetTerms4']
// These are submission inputs and server facts, never a second resource balance.
export type SubmittedIntent = S['SubmittedIntent']

export function currentServerTime(state: GameState) {
  return state.view
    ? state.view.sampled_at + Math.max(0, state.now - state.receivedAt)
    : 0
}

/** Time until confirmed work needs a new authoritative snapshot. */
export function nextWorkDelay(state: GameState) {
  const view = state.view
  if (!view) return Infinity
  const deadlines = view.constructions.map((work) => work.due_at)
  if (view.protocol !== 2) {
    if (view.progression.research_operation)
      deadlines.push(view.progression.research_operation.due_at)
    deadlines.push(
      ...view.progression.manufacturing.map((work) => work.next_due_at),
      ...view.progression.production.flatMap((p) =>
        p.fusion_reactor?.projection_limit == null
          ? []
          : [p.fusion_reactor.projection_limit],
      ),
    )
  }
  return Math.min(...deadlines) - currentServerTime(state)
}

export function activeAttempt(attempt: Attempt, view: BoundView | null) {
  return (
    attempt.status !== 'rejected' &&
    !attempt.reconciled &&
    !(
      attempt.receipt?.status === 'Committed' &&
      view &&
      sameBinding(attempt.envelope.binding, view.binding) &&
      BigInt(view.viewer_revision) >=
        BigInt(attempt.receipt.minimum_viewer_revision)
    )
  )
}

export function commandBody(command: Command, view: BoundView | null) {
  if (command.type === 'World' && command.action.type === 'RenamePlanet')
    return command.action.body
  if ('body' in command) return command.body
  if ('host' in command) return command.host
  if ('origin' in command) return command.origin
  if (command.type === 'CancelConstruction')
    return view?.constructions.find((work) => work.id === command.operation)
      ?.body
  if (command.type === 'CancelResearch' && view?.protocol !== 2)
    return view?.progression.research_operation?.host
  if (command.type === 'World' && command.action.type === 'LaunchFleet')
    return command.action.intent.origin
  if (
    command.type === 'World' &&
    command.action.type === 'RecallMission' &&
    view?.protocol === 4
  ) {
    const fleet = command.action.fleet
    return view.missions.fleets.find((entry) => entry.id === fleet)?.intent
      .origin
  }
  return undefined
}

/** Existing entity IDs take precedence over accepted creator aliases. */
export function commandParent(
  state: GameState,
  command: Command,
): Attempt | undefined {
  const view = state.view
  if (!view) return
  let reference: string, creator: (command: Command) => boolean
  if (command.type === 'CancelConstruction') {
    if (view.constructions.some((work) => work.id === command.operation)) return
    reference = command.operation
    creator = (command) =>
      command.type === 'StartUpgrade' || command.type === 'StartDemolition'
  } else if (command.type === 'CancelResearch') {
    if (
      view.protocol !== 2 &&
      view.progression.research_operation?.id === command.operation
    )
      return
    reference = command.operation
    creator = (command) => command.type === 'StartResearch'
  } else if (command.type === 'RecallFleet') {
    if (view.fleets.some((fleet) => fleet.id === command.fleet)) return
    reference = command.fleet
    creator = (command) => command.type === 'LaunchTransport'
  } else if (
    command.type === 'World' &&
    command.action.type === 'RecallMission'
  ) {
    const fleet = command.action.fleet
    if (
      view.protocol === 4 &&
      view.missions.fleets.some((entry) => entry.id === fleet)
    )
      return
    reference = fleet
    creator = (command) =>
      command.type === 'World' && command.action.type === 'LaunchFleet'
  } else return
  const parent = state.attempts.get(attemptKey(view.binding, reference))
  return parent && creator(parent.envelope.command) ? parent : undefined
}
export function acceptedEntityReference(
  state: GameState,
  attempt: Attempt,
): string | null {
  if (attempt.receipt?.status === 'Committed')
    return attempt.receipt.result_ids[0] ?? null
  return state.view?.progress?.command_references &&
    attempt.receipt?.status === 'Pending'
    ? attempt.envelope.command_id
    : null
}

export function pendingBody(state: GameState, body: string) {
  return [...state.attempts.values()].some((attempt) => {
    if (!activeAttempt(attempt, state.view)) return false
    const command = attempt.envelope.command
    const origin = commandBody(command, state.view)
    return (
      origin === body ||
      ((command.type === 'CancelConstruction' ||
        command.type === 'CancelResearch') &&
        !origin)
    )
  })
}

export function pendingCommand(state: GameState, command: Command) {
  const body = commandBody(command, state.view)
  if (
    body &&
    [...state.attempts].some(([key, attempt]) => {
      if (!activeAttempt(attempt, state.view) || state.intents.has(key))
        return false
      const other = attempt.envelope.command,
        origin = commandBody(other, state.view)
      return (
        origin === body ||
        ((other.type === 'CancelConstruction' ||
          other.type === 'CancelResearch') &&
          !origin)
      )
    })
  )
    return true
  return [...state.attempts.values()].some((attempt) => {
    if (!activeAttempt(attempt, state.view)) return false
    const other = attempt.envelope.command
    return (
      canonical(other) === canonical(command) ||
      (command.type === 'StartResearch' && other.type === 'StartResearch') ||
      ((command.type === 'StartUpgrade' ||
        command.type === 'StartDemolition') &&
        (other.type === 'StartUpgrade' || other.type === 'StartDemolition') &&
        command.body === other.body)
    )
  })
}

export function constructionPending(state: GameState, body: string) {
  return [...state.attempts.values()].some(
    (attempt) =>
      activeAttempt(attempt, state.view) &&
      (attempt.envelope.command.type === 'StartUpgrade' ||
        attempt.envelope.command.type === 'StartDemolition') &&
      attempt.envelope.command.body === body,
  )
}
export function manufacturingPending(state: GameState, body: string) {
  return [...state.attempts.values()].some(
    (attempt) =>
      activeAttempt(attempt, state.view) &&
      attempt.envelope.command.type === 'StartManufacture' &&
      attempt.envelope.command.body === body,
  )
}

export function canSubmitIntent(
  state: GameState,
  command: Command,
  intent: SubmittedIntent,
) {
  const view = projectGameView(state),
    cost = state.view ? payment(command, intent, state.view, state) : null
  if (!view) return false
  if (cost && !cost.refund) {
    const body = view.bodies.find((body) => body.id === cost.body)
    if (!body || !canAfford(cost.delta, body.amounts)) return false
  }
  const fleet =
    command.type === 'World' && command.action.type === 'LaunchFleet'
      ? command.action.intent
      : command.type === 'LaunchTransport'
        ? command
        : null
  if (fleet) {
    const body = view.bodies.find((body) => body.id === fleet.origin)
    if (
      !body ||
      fleet.ships.some(
        (ship) =>
          ship.owner !== view.binding.player ||
          BigInt(
            body.inventories.find(
              (entry) =>
                entry.item.kind === 'Ship' && entry.item.id === ship.ship_type,
            )?.count ?? '0',
          ) < BigInt(ship.count),
      )
    )
      return false
    if (view.protocol === 4 && command.type === 'World') {
      if (
        BigInt(occupiedFleetSlots(state)) >= BigInt(view.missions.fleet_slots)
      )
        return false
    }
  }
  return true
}

export function canSubmitQuote(
  state: GameState,
  command: Command,
  quote: SubmittedQuote,
) {
  if (
    !state.ready ||
    !state.view ||
    pendingCommand(state, command) ||
    !matchesQuote(command, quote, state.view)
  )
    return false
  return canSubmitIntent(state, command, {
    quote,
    submittedAt: currentServerTime(state),
    baseRevision: state.view.viewer_revision,
  })
}

function requestFor(command: Command) {
  switch (command.type) {
    case 'StartUpgrade':
      return { type: 'Upgrade', body: command.body, building: command.building }
    case 'StartDemolition':
      return {
        type: 'Demolition',
        body: command.body,
        building: command.building,
      }
    case 'StartResearch':
      return {
        type: 'Research',
        host: command.host,
        research: command.research,
      }
    case 'StartManufacture':
      return {
        type: 'Manufacture',
        body: command.body,
        item: command.item,
        quantity: command.quantity,
      }
    case 'LaunchTransport': {
      return {
        type: 'Transport',
        origin: command.origin,
        target: command.target,
        ships: command.ships,
        cargo: command.cargo,
        speed_percent: command.speed_percent,
      }
    }
  }
  return null
}

export function matchesQuote(
  command: Command,
  quote: SubmittedQuote,
  view: BoundView,
) {
  if ('intent' in quote)
    return (
      command.type === 'World' &&
      command.action.type === 'LaunchFleet' &&
      command.action.expected_terms_hash === quote.terms_hash &&
      quote.profile_hash === view.profile_hash &&
      canonical(command.action.intent) === canonical(quote.intent)
    )
  if (!('expected_terms_hash' in command)) return false
  const hash =
    'request' in quote && !('terms_hash' in quote)
      ? quote.terms.terms_hash
      : quote.terms_hash
  if (hash !== command.expected_terms_hash) return false
  if ('request' in quote)
    return (
      quote.protocol === view.protocol &&
      sameBinding(quote.binding, view.binding) &&
      canonical(quote.request) === canonical(requestFor(command)) &&
      quoteProfile(quote) === view.profile_hash
    )
  return quote.profile_hash === view.profile_hash
}

function quoteProfile(quote: SubmittedQuote) {
  const terms = material(quote)
  if (terms)
    return terms.type === 'Transport'
      ? terms.legacy.profile_hash
      : terms.profile_hash
  return legacyTerms(quote)?.profile_hash
}

function material(quote?: SubmittedQuote): S['ProgressionMaterial'] | null {
  if (!quote || !('request' in quote)) return null
  if ('terms_hash' in quote) return quote.terms
  return quote.protocol === 2 ? null : quote.terms.material
}

function legacyTerms(quote?: SubmittedQuote): Quote | null {
  if (!quote || 'intent' in quote) return null
  if ('cost' in quote) return quote
  return 'request' in quote && !('terms_hash' in quote) && quote.protocol === 2
    ? quote.terms
    : null
}

export function submittedIntents(state: GameState) {
  if (!state.view) return []
  const result: { attempt: Attempt; intent: SubmittedIntent }[] = []
  for (const [key, attempt] of state.attempts) {
    const intent = state.intents.get(key)
    if (
      intent &&
      sameBinding(attempt.envelope.binding, state.view.binding) &&
      activeAttempt(attempt, state.view) &&
      !(
        intent.dependsOn &&
        state.attempts.get(
          attemptKey(attempt.envelope.binding, intent.dependsOn),
        )?.status === 'rejected'
      )
    )
      result.push({ attempt, intent })
  }
  return result
}

export function pendingConstruction(state: GameState, body: string) {
  if (state.view?.constructions.some((work) => work.body === body)) return null
  for (const { attempt, intent } of submittedIntents(state)) {
    const command = attempt.envelope.command
    if (
      (command.type !== 'StartUpgrade' && command.type !== 'StartDemolition') ||
      command.body !== body
    )
      continue
    const terms = material(intent.quote),
      legacy = legacyTerms(intent.quote)
    if (terms?.type !== 'Building' && legacy?.target_level == null) continue
    const startedAt =
      attempt.receipt?.executed_at ??
      attempt.receipt?.admitted_at ??
      intent.submittedAt
    const duration_ms =
      terms?.type === 'Building' ? terms.duration_ms : legacy!.duration
    return {
      commandId: attempt.envelope.command_id,
      operationId: acceptedEntityReference(state, attempt),
      status: attempt.status,
      body,
      building: command.building,
      target_level:
        terms?.type === 'Building' ? terms.target_level : legacy!.target_level!,
      paid: terms?.type === 'Building' ? terms.paid : legacy!.cost,
      duration_ms,
      startedAt,
      due_at: startedAt + duration_ms,
    }
  }
  return null
}

export function pendingProgression(state: GameState) {
  return submittedIntents(state).flatMap(({ attempt, intent }) => {
    if (!overlayApplies(attempt, intent, state.view!)) return []
    const terms = material(intent.quote)
    return terms && terms.type !== 'Transport'
      ? [
          {
            commandId: attempt.envelope.command_id,
            status: attempt.status,
            operationId: acceptedEntityReference(state, attempt),
            terms,
            submittedAt:
              attempt.receipt?.executed_at ??
              attempt.receipt?.admitted_at ??
              intent.submittedAt,
          },
        ]
      : []
  })
}

export function pendingWork(state: GameState, body: string) {
  const progression = pendingProgression(state)
  return {
    construction: pendingConstruction(state, body),
    research:
      state.view?.protocol !== 2 && state.view?.progression.research_operation
        ? null
        : (progression.find((entry) => entry.terms.type === 'Research') ??
          null),
    manufacturing: progression.filter(
      (entry) =>
        entry.terms.type === 'Manufacture' && entry.terms.body === body,
    ),
  }
}

/** Confirmed missions and unresolved departures share the same slot budget. */
export function occupiedFleetSlots(state: GameState) {
  if (state.view?.protocol !== 4) return 0
  const awaitingLaunch = [...state.attempts.values()].filter(
    (attempt) =>
      activeAttempt(attempt, state.view) &&
      attempt.envelope.command.type === 'World' &&
      attempt.envelope.command.action.type === 'LaunchFleet',
  ).length
  return state.view.missions.fleets.length + awaitingLaunch
}

export function pendingFleetLaunches(state: GameState) {
  return submittedIntents(state)
    .filter(
      ({ attempt, intent }) =>
        attempt.envelope.command.type === 'World' &&
        attempt.envelope.command.action.type === 'LaunchFleet' &&
        overlayApplies(attempt, intent, state.view!),
    )
    .map((entry) => {
      const fleetId = acceptedEntityReference(state, entry.attempt)
      const recalling =
        !!fleetId &&
        pendingCommand(state, {
          type: 'World',
          action: { type: 'RecallMission', fleet: fleetId },
        })
      return {
        ...entry,
        fleetId,
        canRecall: !!fleetId && !recalling,
        recalling,
      }
    })
}

// Keep the last confirmed snapshot while a newer revision could either precede
// or contain an optimistic action. Only its receipt disambiguates those cases.
// Polling already recovers receipts before refreshing; this adds no network work.
export function snapshotNeedsReceipt(state: GameState, next: BoundView) {
  const view = state.view
  if (!view) return false
  return submittedIntents(state).some(({ attempt, intent }) => {
    if (
      attempt.status === 'committed' ||
      BigInt(next.viewer_revision) <= BigInt(intent.baseRevision)
    )
      return false
    const command = attempt.envelope.command
    if (payment(command, intent, view, state)) return true
    if (command.type === 'SetProduction')
      return (
        view.protocol !== 2 &&
        view.progression.production.some(
          (production) => production.body === command.body,
        )
      )
    if (command.type === 'LaunchTransport')
      return view.bodies.some((body) => body.id === command.origin)
    if (command.type === 'World' && command.action.type === 'LaunchFleet') {
      const origin = command.action.intent.origin
      return view.bodies.some((body) => body.id === origin)
    }
    if (
      command.type === 'World' &&
      command.action.type === 'RecallMission' &&
      view.protocol === 4
    ) {
      const fleet = command.action.fleet
      return view.missions.fleets.some((mission) => mission.id === fleet)
    }
    return false
  })
}

// Defensive guard for externally supplied state. Coordinator refreshes defer
// these ambiguous revisions until the receipt makes their effects unambiguous.
function overlayApplies(
  attempt: Attempt,
  intent: SubmittedIntent,
  view: BoundView,
) {
  return (
    activeAttempt(attempt, view) &&
    (attempt.receipt?.status === 'Committed' ||
      BigInt(view.viewer_revision) <= BigInt(intent.baseRevision))
  )
}

function payment(
  command: Command,
  intent: SubmittedIntent,
  view: BoundView,
  state?: GameState,
): { body: string; delta: S['Resources']; refund?: boolean } | null {
  const terms = material(intent.quote),
    legacy = legacyTerms(intent.quote)
  if (terms && 'paid' in terms)
    return {
      body: terms.type === 'Research' ? terms.host : terms.body,
      delta: terms.paid,
    }
  if (command.type === 'StartUpgrade' && legacy)
    return { body: command.body, delta: legacy.cost }
  if (command.type === 'CancelConstruction') {
    const work = view.constructions.find(
      (work) => work.id === command.operation,
    )
    return work
      ? { body: work.body, delta: work.paid, refund: true }
      : parentRefund(state, command, view)
  }
  if (command.type === 'CancelResearch' && view.protocol !== 2) {
    const work = view.progression.research_operation
    return work?.id === command.operation
      ? { body: work.host, delta: work.paid, refund: true }
      : parentRefund(state, command, view)
  }
  const fleet =
    command.type === 'World' && command.action.type === 'LaunchFleet'
      ? command.action.intent
      : command.type === 'LaunchTransport'
        ? command
        : null
  if (!fleet) return null
  const fuel =
    intent.quote && 'intent' in intent.quote
      ? intent.quote.fuel
      : (legacy?.fuel ??
        (terms?.type === 'Transport' ? terms.legacy.fuel : undefined))
  if (fuel === undefined) return null
  return {
    body: fleet.origin,
    delta: {
      ...fleet.cargo,
      deuterium: (BigInt(fleet.cargo.deuterium) + BigInt(fuel)).toString(),
    },
  }
}

function parentRefund(
  state: GameState | undefined,
  command: Command,
  view: BoundView,
) {
  if (!state) return null
  const parent = commandParent(state, command)
  if (!parent || parent.status === 'rejected') return null
  const intent = state.intents.get(
    attemptKey(parent.envelope.binding, parent.envelope.command_id),
  )
  const paid = intent ? payment(parent.envelope.command, intent, view) : null
  return paid ? { ...paid, refund: true } : null
}

function advance(
  amounts: S['Resources'],
  capacity: S['Resources'],
  rate: S['Resources'] | null,
  elapsed: number,
) {
  if (!rate || elapsed <= 0) return amounts
  const next = { ...amounts },
    dt = BigInt(Math.floor(elapsed))
  for (const name of resourceNames) {
    const amount = BigInt(amounts[name]),
      perHour = BigInt(rate[name]),
      cap = BigInt(capacity[name])
    if (perHour >= 0n && amount >= cap) continue
    const grown = amount + (perHour * dt) / 3600000n
    next[name] = (
      grown < 0n ? 0n : perHour >= 0n && grown > cap ? cap : grown
    ).toString()
  }
  return next
}

export function projectGameView(state: GameState): BoundView | null {
  if (!state.view) return null
  const view = structuredClone(state.view)
  const active = submittedIntents(state).filter(({ attempt, intent }) =>
    overlayApplies(attempt, intent, view),
  )
  for (const body of view.bodies) {
    const deadlines = view.constructions
      .filter((work) => work.body === body.id)
      .map((work) => work.due_at)
    if (view.protocol !== 2) {
      if (view.progression.research_operation)
        deadlines.push(view.progression.research_operation.due_at)
      deadlines.push(
        ...view.progression.manufacturing
          .filter((work) => work.body === body.id)
          .map((work) => work.next_due_at),
      )
    }
    if (view.protocol !== 2) {
      const fuelLimit = view.progression.production.find(
        (p) => p.body === body.id,
      )?.fusion_reactor?.projection_limit
      if (fuelLimit != null) deadlines.push(fuelLimit)
    }
    let horizon = Math.max(
      view.as_of_ms,
      Math.min(
        view.progress ? currentServerTime(state) : view.as_of_ms,
        view.progress?.projection_limit ?? Number.POSITIVE_INFINITY,
        ...deadlines,
      ),
    )
    for (const { attempt, intent } of active)
      if (
        (attempt.envelope.command.type === 'SetProduction' &&
          attempt.envelope.command.body === body.id) ||
        (view.protocol !== 2 &&
          view.progression.production.some(
            (p) => p.body === body.id && p.fusion_reactor,
          ) &&
          payment(attempt.envelope.command, intent, view, state)?.body ===
            body.id)
      )
        horizon = Math.min(horizon, intent.submittedAt)
    const rate = rawResourceRates(view, body)
    let cursor = view.as_of_ms
    for (const { attempt, intent } of active.sort(
      (a, b) => a.intent.submittedAt - b.intent.submittedAt,
    )) {
      const cost = payment(attempt.envelope.command, intent, view, state)
      if (!cost || cost.body !== body.id) continue
      const at = Math.max(
        cursor,
        Math.min(horizon, attempt.receipt?.executed_at ?? intent.submittedAt),
      )
      body.amounts = advance(body.amounts, body.capacity, rate, at - cursor)
      cursor = at
      for (const name of resourceNames) {
        const amount =
          BigInt(body.amounts[name]) +
          BigInt(cost.delta[name]) * (cost.refund ? 1n : -1n)
        body.amounts[name] = (amount < 0n ? 0n : amount).toString()
      }
    }
    body.amounts = advance(body.amounts, body.capacity, rate, horizon - cursor)
    for (const { attempt, intent } of active) {
      const command = attempt.envelope.command
      const terms = material(intent.quote)
      if (terms?.type === 'Building' && terms.body === body.id)
        body.fields_reserved += terms.reserve_fields
      if (
        command.type === 'CancelConstruction' &&
        view.constructions.some(
          (work) => work.id === command.operation && work.body === body.id,
        )
      )
        body.fields_reserved = 0
      const fleet =
        command.type === 'World' && command.action.type === 'LaunchFleet'
          ? command.action.intent
          : command.type === 'LaunchTransport'
            ? command
            : null
      if (!fleet || fleet.origin !== body.id) continue
      for (const ship of fleet.ships) {
        if (ship.owner !== view.binding.player) continue
        const inventory = body.inventories.find(
          (entry) =>
            entry.item.kind === 'Ship' && entry.item.id === ship.ship_type,
        )
        if (inventory)
          inventory.count = (
            BigInt(inventory.count) > BigInt(ship.count)
              ? BigInt(inventory.count) - BigInt(ship.count)
              : 0n
          ).toString()
      }
    }
  }
  for (const { attempt } of active) {
    const command = attempt.envelope.command
    if (command.type === 'CancelConstruction')
      view.constructions = view.constructions.filter(
        (work) => work.id !== command.operation,
      )
    if (view.protocol !== 2) {
      if (
        command.type === 'CancelResearch' &&
        view.progression.research_operation?.id === command.operation
      )
        view.progression.research_operation = null
      if (command.type === 'SetProduction') {
        const production = view.progression.production.find(
          (entry) => entry.body === command.body,
        )
        if (production) production.settings = command.settings
      }
    }
    if (
      view.protocol === 4 &&
      command.type === 'World' &&
      command.action.type === 'RecallMission'
    ) {
      const fleetId = command.action.fleet
      const fleet = view.missions.fleets.find((entry) => entry.id === fleetId)
      if (fleet) fleet.can_recall = false
    }
  }
  return view
}
