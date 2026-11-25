import { dispatchableShipTypes } from '../client-model/ship-selection'
import {
  DispatchRequests,
  type DispatchCargoFill,
  type DispatchSubmission,
} from './dispatch-requests'
import type { DispatchNavigation } from './routed-dispatch'
import { revalidateReview } from './dispatch-review-session'
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
import { useFleetReview } from './use-fleet-review'
import {
  dispatchCargoCapacity,
  displayedCargo,
  editDispatchCargo,
  emptyCargoDraft,
  restoredCargoDraft,
  type CargoDraft,
} from '../client-model/dispatch-cargo'
import { resourceNames } from '../client-model/resources'
import { dispatchShips } from '../client-model/dispatch-timing'
import { recyclerSuggestion } from '../client-model/galaxy-harvest'
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
  navigation,
}: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  draft: DispatchDraft | null
  navigation?: DispatchNavigation
}) {
  const [initialReview] = useState(navigation?.restored)
  const [checkingReview, setCheckingReview] = useState(!!initialReview)
  const tutorial = useStore(model.store, (s) => s.tutorial)
  const siteId =
    draft?.target?.type === 'Site' ? draft.target.selection.id : undefined
  const site = siteContext(tutorial.data, siteId)
  const siteSelection =
    initialReview?.terms.intent.destination.type === 'Site'
      ? initialReview.terms.intent.destination.selection
      : (site?.site.destination.selection ??
        (draft?.target?.type === 'Site' ? draft.target.selection : undefined))
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
    [holdHours, setHoldHours] = useState<
      NonNullable<S['FleetIntent4']['hold_hours']>
    >(initialReview?.terms.intent.hold_hours ?? 1),
    [speed, setSpeed] = useState(draft?.speed ?? 100),
    [shipSelection, setShips] = useState<Record<string, string> | null>(
      draft?.ships ?? (draft?.suggestRecyclers ? null : {}),
    ),
    [editor, setEditor] = useState<{
      draft: CargoDraft
      estimate?: Pick<S['FleetEstimate4'], 'fuel' | 'maximum_payload'>
    }>(() => ({
      draft: initialReview
        ? restoredCargoDraft(initialReview.terms.intent)
        : emptyCargoDraft(),
      estimate: initialReview?.terms,
    })),
    [error, setError] = useState(
      navigation?.expired
        ? 'This fleet review has ended. Prepare a new fleet.'
        : '',
    ),
    [busy, setBusy] = useState(false)
  const reviewPanel = useFleetReview(
    model,
    view.viewer_revision,
    initialReview?.terms,
    !checkingReview,
  )
  const quote = reviewPanel.state?.latest ?? null
  const setQuote = reviewPanel.open
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
  const destructionTargetProblem =
    mission === 'DestroyMoon' && targetKind !== 'moon'
      ? 'Choose another player’s moon for destruction.'
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
    : destructionTargetProblem || localTargetProblem || destination.problem
  const attackWarning =
    mission === 'Attack'
      ? ''
      : observedMissionWarning(mission, observedTarget ?? undefined)
  const types = dispatchableShipTypes(view.catalog, body.inventories)
  const reportHarvest =
    draft?.suggestRecyclers &&
    mission === 'Harvest' &&
    targetKind === 'debris' &&
    destinationText === coordinateText(draft.coordinates)
  const reportSalvage =
    reportHarvest && !destination.problem && destination.currentDebris
      ? recyclerSuggestion(
          view.catalog,
          body.inventories,
          destination.currentDebris,
        )
      : null
  // A null selection is an untouched report draft awaiting its first lookup.
  // Ship edits, changing the destination, and completed lookups consume it.
  let ships = shipSelection ?? {}
  if (
    shipSelection === null &&
    (!reportHarvest || destination.observationSettled)
  ) {
    if (reportSalvage && reportSalvage.suggested !== '0')
      ships = { Recycler: reportSalvage.suggested }
    setShips(ships)
  }
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
  const cargo = displayedCargo(
    editor.draft,
    body.amounts,
    timing?.terms ?? editor.estimate,
  )
  const authorization = reviewPanel.authorization
  const command: Command | null = authorization
    ? {
        type: 'World',
        action: {
          type: 'LaunchFleet',
          intent: authorization.intent,
          expected_terms_hash: authorization.terms_hash,
        },
      }
    : null
  useEffect(() => {
    if (quote && !wasReviewing.current) {
      quoteRef.current?.focus({ preventScroll: true })
      quoteRef.current?.parentElement?.scrollIntoView({ block: 'start' })
    } else if (!quote && wasReviewing.current) {
      reviewButtonRef.current?.focus()
    }
    wasReviewing.current = !!quote
  }, [quote])
  const [requests] = useState(() => new DispatchRequests())
  const closeReview = () => {
    requests.invalidate()
    setCheckingReview(false)
    setQuote(null)
    navigation?.close('edit')
  }
  useEffect(() => {
    if (!initialReview) return
    const generation = requests.invalidate()
    void revalidateReview(model, initialReview).then(
      (latest) => {
        if (requests.isCurrent(generation)) {
          setQuote(initialReview.terms, latest)
          setCheckingReview(false)
        }
      },
      (error: Error) => {
        if (requests.isCurrent(generation)) {
          closeReview()
          setError(error.message)
        }
      },
    )
    return () => {
      requests.invalidate()
    }
    // Revalidate on return to this entry. Ordinary view revisions keep live guards below.
  }, [model, initialReview, requests])
  const [submitted, setSubmitted] = useState<DispatchSubmission | null>(null)
  const submittedAttempt = useStore(model.store, (state) =>
    submitted ? state.attempts.get(submitted.key) : undefined,
  )
  const submittedStatus = submittedAttempt?.status
  useEffect(() => {
    if (requests.shouldResetDraft(submitted, submittedStatus)) {
      setShips({})
      setEditor({ draft: emptyCargoDraft() })
      setQuote(null)
      if (
        submittedAttempt?.envelope.command.type === 'World' &&
        submittedAttempt.envelope.command.action.type === 'LaunchFleet' &&
        submittedAttempt.envelope.command.action.intent.cargo_fill
      )
        navigation?.finishSend()
    }
  }, [submitted, submittedStatus, requests, setQuote])
  const receipt = submittedAttempt?.receipt
  useEffect(() => {
    if (
      !submitted ||
      !requests.isCurrent(submitted.generation) ||
      !quote?.intent.cargo_fill
    )
      return
    if (receipt?.status === 'Rejected' && receipt.code === 'QuoteChanged') {
      setSubmitted(null)
      if (reviewPanel.state)
        navigation?.open(reviewPanel.state.reviewed, submitted.coordinates)
      void model.dismiss(receipt.command_id)
      void reviewPanel.refresh()
    } else if (
      submittedStatus === 'uncertain' ||
      submittedStatus === 'rejected'
    ) {
      navigation?.finishSend()
      setQuote(null)
    }
  }, [
    receipt,
    submitted,
    submittedStatus,
    requests,
    quote,
    reviewPanel.refresh,
    setQuote,
  ])
  const sending =
    !!submitted &&
    requests.isCurrent(submitted.generation) &&
    !!quote?.intent.cargo_fill
  const canSend =
    !checkingReview &&
    !!command &&
    !!authorization &&
    !sending &&
    !reviewPanel.state?.refreshing &&
    !reviewPanel.state?.problem &&
    canSubmitQuote(model.store.getState(), command, authorization)
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
    setCheckingReview(false)
    setOrigin(body.id)
    setShips({})
    setEditor({ draft: emptyCargoDraft() })
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
      closeReview()
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
      closeReview()
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
      checkingReview ||
      !command ||
      !authorization ||
      authorization.intent.origin !== body.id ||
      !canSend
    )
      return
    const flexible = !!authorization.intent.cargo_fill
    if (
      navigation &&
      !(flexible ? navigation.claimSend() : navigation.close('send'))
    )
      return
    const id = await requests.submit(
      command,
      authorization,
      {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      },
      {
        attempts: () => model.store.getState().attempts,
        send: (command, quote) => model.send(command, quote),
        submitted: setSubmitted,
        closeReview: () =>
          setQuote(authorization.intent.cargo_fill ? authorization : null),
      },
    )
    if (!id && flexible)
      navigation?.open(authorization, {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      })
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
        cargoDraft: editor.draft,
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
        quote: (terms) => {
          setQuote(terms)
          navigation?.open(terms, {
            galaxy: Number(galaxy),
            system: Number(system),
            position: Number(position),
          })
        },
        cargo: (draft, estimate) => setEditor({ draft, estimate }),
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
    cargoCapacity: dispatchCargoCapacity(timing?.terms, cargo),
    cargoCapacityMessage: invalidShips
      ? 'Enter valid ship counts to see capacity.'
      : timingShips.length === 0
        ? 'Select ships to see capacity.'
        : !timingReady || timing?.error
          ? 'Capacity unavailable.'
          : 'Calculating capacity…',
    timingMessage: !coordinatesValid
      ? 'Enter a valid destination to see flight times.'
      : targetProblem
        ? mission === 'Harvest' && targetProblem === destination.problem
          ? 'Choose a debris field to see flight times.'
          : targetProblem
        : timingShips.length === 0
          ? 'Select ships to see flight times.'
          : timing?.error,
    addAllCargo: () => review('all'),
    maxCargo: (resource: (typeof resourceNames)[number]) => review(resource),
    destinationText,
    setDestinationText,
    targetKind,
    setTargetKind,
    destination,
    reportSalvage,
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
    editCargo: (index: number, value: string) =>
      setEditor((old) => ({
        ...old,
        draft: editDispatchCargo(old.draft, index, value),
      })),
    editReview: () => {
      closeReview()
      void model.refresh()
    },
    reviewPanel,
    canSend,
    sending,
    quote,
    closeReview,
    checkingReview,
    entryNotice: !!initialReview || !!navigation?.expired,
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
