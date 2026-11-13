import {
  DispatchRequests,
  type DispatchCargoFill,
  type DispatchSubmission,
} from './dispatch-requests'
import { siteContext } from './tutorial/model'
import { observedBody } from './galaxy-body'
import { useDispatchDestination } from './use-dispatch-destination'
import { coordinateFields } from '../ui/coordinate-input-model'
import { coordinateText, type LocationKind } from '../shell/location-address'
import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { Command } from '../client-model/commands'
import {
  canSubmitQuote,
  currentServerTime,
  projectGameView,
} from '../client-model/game-projection'
import { dispatchCargoCapacity } from '../client-model/dispatch-cargo'
import { resourceNames } from '../client-model/resources'
import { dispatchShips } from '../client-model/dispatch-timing'
import { useDispatchTiming } from './use-dispatch-timing'
import type { DispatchDraft } from './missions'
import { colonizationStatus } from '../client-model/colonization'
import {
  coordinateErrors,
  destinationError,
  observedMissionWarning,
} from '../client-model/dispatch-validation'
type S = components['schemas']
export function useDispatch({
  model,
  view,
  body,
  draft,
}: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  draft: DispatchDraft | null
}) {
  const tutorial = useStore(model.store, (s) => s.tutorial)
  const siteId =
    draft?.target?.type === 'Site' ? draft.target.selection.id : undefined
  const site = siteContext(tutorial.data, siteId)
  const siteSelection =
    site?.site.destination.selection ??
    (draft?.target?.type === 'Site' ? draft.target.selection : undefined)
  const [mission, setMission] = useState<DispatchDraft['mission']>(
      draft?.attackGroup ? 'Attack' : (draft?.mission ?? 'Transport'),
    ),
    [destinationText, setDestinationText] = useState(
      draft
        ? coordinateText(draft.coordinates)
        : `${body.coordinates.galaxy}:1:1`,
    ),
    [targetKind, setTargetKind] = useState<LocationKind>(
      draft?.targetKind ??
        (draft?.target?.type === 'Body' && draft.target.expected_kind === 'Moon'
          ? 'moon'
          : 'planet'),
    ),
    [holdHours, setHoldHours] =
      useState<NonNullable<S['FleetIntent4']['hold_hours']>>(1),
    [speed, setSpeed] = useState(draft?.speed ?? 100),
    [ships, setShips] = useState<Record<string, string>>(draft?.ships ?? {}),
    [cargo, setCargo] = useState(['0', '0', '0']),
    [quote, setQuote] = useState<S['FleetTerms4'] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const { galaxy, system, position } = coordinateFields(destinationText)
  const now = useStore(model.store, currentServerTime)
  const coordinateProblems = coordinateErrors(
    { galaxy, system, position },
    model.settings,
  )
  const coordinatesValid = !Object.values(coordinateProblems).some(Boolean)
  const destinationCoordinates = coordinatesValid
    ? {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      }
    : null
  const destination = useDispatchDestination(
    model,
    view,
    body.id,
    siteId ? null : destinationCoordinates,
    targetKind,
    mission,
  )
  const { target, observation } = destination
  const observedTarget = observedBody(observation, target?.id)
  const colony = colonizationStatus(view, Number(position))
  const localTargetProblem =
    targetKind === 'moon' && (mission === 'Colonize' || mission === 'Harvest')
      ? 'Choose a planet position for colonization or debris for harvesting.'
      : targetKind === 'debris' && mission !== 'Harvest'
        ? 'Choose Harvest for a debris field.'
        : mission === 'Colonize' && colony.reason
          ? colony.reason
          : target && mission !== 'Harvest'
            ? destinationError(
                mission,
                {
                  type: 'Body',
                  id: target.id,
                  expected_owner: target.owner,
                  expected_kind: target.kind,
                },
                view.binding.player,
                body.id,
              )
            : ''
  const targetProblem = siteId
    ? !site
      ? tutorial.loading
        ? 'Receiving private site…'
        : 'Site unavailable. Return to opening guidance and refresh the briefing.'
      : site.site.retired
        ? 'This introductory opportunity has ended. Follow accepted fleets or return to guidance.'
        : site.busy
          ? 'An operation is already in flight. Follow it in Fleets.'
          : ''
    : localTargetProblem || destination.problem
  const attackWarning =
    mission === 'Attack'
      ? ''
      : observedMissionWarning(mission, observedTarget ?? undefined)
  const types = view.catalog.flatMap((entry) =>
    entry.key.kind === 'Ship' &&
    entry.mobile &&
    (entry.enabled ||
      body.inventories.some(
        (stack) =>
          stack.item.kind === 'Ship' &&
          stack.item.id === entry.key.id &&
          BigInt(stack.count) > 0n,
      ))
      ? [entry.key.id]
      : [],
  )
  const quoteRef = useRef<HTMLElement>(null)
  let timingShips: S['FleetIntent4']['ships'] = []
  let invalidShips = false
  try {
    timingShips = dispatchShips(types, ships, view.binding.player)
  } catch {
    invalidShips = true
    // Keep invalid edits local; review reports the validation error.
  }
  const timingReady =
    coordinatesValid && !targetProblem && timingShips.length > 0
  const timing = useDispatchTiming(
    model,
    timingReady
      ? {
          site: siteSelection,
          kind: targetKind === 'moon' ? 'Moon' : 'Planet',
          coordinates: {
            galaxy: Number(galaxy),
            system: Number(system),
            position: Number(position),
          },
          intent: {
            origin: body.id,
            ...(draft?.attackGroup ? { attack_group: draft.attackGroup } : {}),
            mission,
            ...(mission === 'Hold' ? { hold_hours: holdHours } : {}),
            ships: timingShips,
            cargo: { metal: '0', crystal: '0', deuterium: '0' },
            speed_percent: speed as S['FleetIntent4']['speed_percent'],
          },
        }
      : null,
    view.viewer_revision,
    !busy && !quote,
    true,
  )
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  const wasReviewing = useRef(false)
  const command: Command | null = quote
    ? {
        type: 'World',
        action: {
          type: 'LaunchFleet',
          intent: quote.intent,
          expected_terms_hash: quote.terms_hash,
        },
      }
    : null
  useEffect(() => {
    if (quote) {
      quoteRef.current?.focus({ preventScroll: true })
      quoteRef.current?.parentElement?.scrollIntoView({ block: 'start' })
    } else if (wasReviewing.current) {
      reviewButtonRef.current?.focus()
    }
    wasReviewing.current = !!quote
  }, [quote])
  const [requests] = useState(() => new DispatchRequests())
  const [submitted, setSubmitted] = useState<DispatchSubmission | null>(null)
  const submittedAttempt = useStore(model.store, (state) =>
    submitted ? state.attempts.get(submitted.key) : undefined,
  )
  const submittedStatus = submittedAttempt?.status
  useEffect(() => {
    if (requests.shouldResetDraft(submitted, submittedStatus)) {
      setShips({})
      setCargo(['0', '0', '0'])
    }
  }, [submitted, submittedStatus, requests])
  const preparedReview = useRef(!!draft?.reviewOnOpen)
  useEffect(() => {
    if (!preparedReview.current) return
    preparedReview.current = false
    void requests.prepare(
      async () => {
        await model.refresh()
        const state = model.store.getState()
        if (!state.ready || state.stale || state.connectionInterrupted)
          throw Error('Fleet availability could not be refreshed')
      },
      () => review(),
      {
        busy: setBusy,
        error: setError,
      },
    )
  })
  useEffect(
    () => () => {
      requests.invalidate()
    },
    [requests],
  )
  const [origin, setOrigin] = useState(body.id)
  if (origin !== body.id) {
    requests.invalidate()
    setOrigin(body.id)
    setShips({})
    setCargo(['0', '0', '0'])
    setQuote(null)
    setError('')
    setBusy(false)
    setSubmitted(null)
  }
  useEffect(() => {
    if (quote?.intent.destination.type !== 'Site' || !site) return
    if (
      site.site.retired ||
      site.busy ||
      quote.intent.destination.selection.expected_revision !==
        site.site.destination.selection.expected_revision
    ) {
      setQuote(null)
      setError(
        'This site changed. Check its current briefing and review your fleet again.',
      )
    }
  }, [quote, site])
  const quotedGroup = view.attack_groups?.find(
    (g) => g.id === quote?.intent.attack_group,
  )
  useEffect(() => {
    if (
      quote?.intent.attack_group &&
      (!quotedGroup ||
        quotedGroup.revision !== quote.group_revision ||
        !quotedGroup.can_join)
    ) {
      setQuote(null)
      setError(
        'The attack group changed. Review your fleet again for its current arrival and availability.',
      )
    }
  }, [quote, quotedGroup])
  const clear = () => {
    preparedReview.current = false
    requests.invalidate()
    setSubmitted(null)
    setQuote(null)
    setBusy(false)
    setError('')
  }
  async function send() {
    if (
      !command ||
      !quote ||
      quote.intent.origin !== body.id ||
      !canSubmitQuote(model.store.getState(), command, quote)
    )
      return
    await requests.submit(
      command,
      quote,
      {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      },
      {
        attempts: () => model.store.getState().attempts,
        send: (command, quote) => model.send(command, quote),
        submitted: setSubmitted,
        closeReview: () => setQuote(null),
      },
    )
  }

  function review(fillCargo?: DispatchCargoFill) {
    return requests.review(
      {
        coordinateProblems,
        targetProblem,
        galaxy,
        system,
        position,
        targetKind,
        mission,
        holdHours,
        speed,
        types,
        ships,
        cargo,
        player: view.binding.player,
        originId: body.id,
        draft,
        siteId,
        siteSelection,
        estimate: timing?.terms,
      },
      {
        world: (query) => model.world(query),
        origin: () =>
          projectGameView(model.store.getState())?.bodies.find(
            (candidate) => candidate.id === body.id,
          ),
        quote: setQuote,
        cargo: setCargo,
        error: setError,
        busy: setBusy,
        clear: () => {
          setSubmitted(null)
          setQuote(null)
        },
        refreshSite: () => {
          void model.tutorial.ensure(true)
        },
      },
      fillCargo,
    )
  }
  return {
    site,
    siteId,
    target,
    playerNames: { ...observation?.player_names, ...view.player_names },
    submittedAttempt,
    submittedCoordinates: submitted?.coordinates,
    timing: timing?.terms,
    cargoCapacity: dispatchCargoCapacity(quote ?? timing?.terms, cargo),
    cargoCapacityMessage: invalidShips
      ? 'Enter valid ship counts to see capacity.'
      : timingShips.length === 0
        ? 'Select ships to see capacity.'
        : !timingReady || timing?.error
          ? 'Capacity unavailable.'
          : 'Calculating capacity…',
    timingMessage: !coordinatesValid
      ? 'Enter a valid destination to see flight times.'
      : targetProblem ||
        (timingShips.length === 0
          ? 'Select ships to see flight times.'
          : timing?.error),
    addAllCargo: () => review('all'),
    maxCargo: (resource: (typeof resourceNames)[number]) => review(resource),
    destinationText,
    setDestinationText,
    targetKind,
    setTargetKind,
    destination,
    destinationCoordinates,
    colony,
    coordinateProblems,
    coordinatesValid,
    targetProblem,
    attackWarning,
    mission,
    setMission,
    holdHours,
    setHoldHours,
    galaxy,
    system,
    position,
    speed,
    setSpeed,
    ships,
    setShips,
    cargo,
    setCargo,
    quote,
    setQuote,
    error,
    busy,
    now,
    types,
    hasShips: timingShips.length > 0 || invalidShips,
    quoteRef,
    reviewButtonRef,
    command,
    send,
    clear,
    review,
  }
}
