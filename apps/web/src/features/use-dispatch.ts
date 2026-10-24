import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { attemptKey, type Command } from '../client-model/commands'
import {
  canSubmitQuote,
  currentServerTime,
  projectGameView,
} from '../client-model/game-projection'
import { allDispatchCargo } from '../client-model/dispatch-cargo'
import {
  dispatchShips,
  dispatchSelection,
} from '../client-model/dispatch-timing'
import { useDispatchTiming } from './use-dispatch-timing'
import type { DispatchDraft } from './missions'
import { colonizationStatus } from '../client-model/colonization'
import {
  coordinateErrors,
  destinationError,
  dispatchFailure,
  dispatchQuantity,
  parsePastedCoordinates,
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
  const [mission, setMission] = useState<DispatchDraft['mission']>(
      draft?.mission ?? 'Transport',
    ),
    [galaxy, setGalaxy] = useState(
      String(draft?.coordinates.galaxy ?? body.coordinates.galaxy),
    ),
    [system, setSystem] = useState(String(draft?.coordinates.system ?? 1)),
    [position, setPosition] = useState(
      String(draft?.coordinates.position ?? 1),
    ),
    [speed, setSpeed] = useState(100),
    [ships, setShips] = useState<Record<string, string>>({}),
    [cargo, setCargo] = useState(['0', '0', '0']),
    [quote, setQuote] = useState<S['FleetTerms4'] | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const now = useStore(model.store, currentServerTime)
  const coordinateProblems = coordinateErrors(
    { galaxy, system, position },
    model.settings,
  )
  const coordinatesValid = !Object.values(coordinateProblems).some(Boolean)
  const [observation, setObservation] = useState<S['GalaxySystem4'] | null>(
    null,
  )
  useEffect(() => {
    setObservation(null)
  }, [model])
  useEffect(() => {
    let current = true
    setObservation((previous) =>
      previous?.galaxy === Number(galaxy) && previous.system === Number(system)
        ? previous
        : null,
    )
    if (!coordinatesValid || mission === 'Harvest' || mission === 'Colonize')
      return
    const timer = setTimeout(() => {
      void model
        .world({
          type: 'Galaxy',
          galaxy: Number(galaxy),
          system: Number(system),
        })
        .then((result) => {
          if (current && result && 'positions' in result) setObservation(result)
        })
        .catch(() => {
          /* Review still checks eligibility when this advisory read fails. */
        })
    }, 250)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [model, galaxy, system, coordinatesValid, mission, view.viewer_revision])
  const ownedTarget = coordinatesValid
    ? view.bodies.find(
        (candidate) =>
          candidate.kind === 'Planet' &&
          candidate.coordinates.galaxy === Number(galaxy) &&
          candidate.coordinates.system === Number(system) &&
          candidate.coordinates.position === Number(position),
      )
    : undefined
  const observedTarget =
    coordinatesValid &&
    observation?.galaxy === Number(galaxy) &&
    observation.system === Number(system)
      ? observation.positions.find(
          (candidate) => candidate.coordinates.position === Number(position),
        )?.body
      : undefined
  const target = ownedTarget
    ? {
        id: ownedTarget.id,
        owner: view.binding.player,
        kind: ownedTarget.kind,
        name: ownedTarget.name,
      }
    : observedTarget
  const colony = colonizationStatus(view, Number(position))
  const targetProblem =
    mission === 'Colonize' && colony.reason
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
  const attackWarning =
    mission === 'Attack' && observedTarget?.attack_blocker
      ? dispatchFailure(observedTarget.attack_blocker)
      : ''
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
  try {
    timingShips = dispatchShips(types, ships, view.binding.player)
  } catch {
    // Keep invalid edits local; review reports the validation error.
  }
  const timingReady =
    coordinatesValid && !targetProblem && timingShips.length > 0
  const timing = useDispatchTiming(
    model,
    timingReady
      ? {
          coordinates: {
            galaxy: Number(galaxy),
            system: Number(system),
            position: Number(position),
          },
          intent: {
            origin: body.id,
            mission,
            ships: timingShips,
            cargo: { metal: '0', crystal: '0', deuterium: '0' },
            speed_percent: speed as S['FleetIntent4']['speed_percent'],
          },
        }
      : null,
    view.viewer_revision,
    !busy && !quote,
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
      quoteRef.current?.focus()
      quoteRef.current?.scrollIntoView({ block: 'nearest' })
    } else if (wasReviewing.current) {
      reviewButtonRef.current?.focus()
    }
    wasReviewing.current = !!quote
  }, [quote])
  const generation = useRef(0)
  const [submitted, setSubmitted] = useState<{
    key: string
    generation: number
  } | null>(null)
  const submittedStatus = useStore(model.store, (state) =>
    submitted ? state.attempts.get(submitted.key)?.status : undefined,
  )
  useEffect(() => {
    if (!submitted || submittedStatus !== 'committed') return
    if (submitted.generation === generation.current) {
      setShips({})
      setCargo(['0', '0', '0'])
    }
    setSubmitted(null)
  }, [submitted, submittedStatus])
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  const clear = () => {
    generation.current++
    setQuote(null)
    setBusy(false)
    setError('')
  }
  async function send() {
    if (
      !command ||
      !quote ||
      !canSubmitQuote(model.store.getState(), command, quote)
    )
      return
    const requestGeneration = ++generation.current
    setQuote(null)
    const id = await model.send(command, quote)
    if (id && requestGeneration === generation.current)
      setSubmitted({
        key: attemptKey(view.binding, id),
        generation: requestGeneration,
      })
  }
  async function review(addAllCargo = false) {
    const requestGeneration = ++generation.current
    setError('')
    setQuote(null)
    setBusy(true)
    try {
      const coordinateProblem = Object.values(coordinateProblems).find(Boolean)
      if (coordinateProblem) {
        setError(coordinateProblem)
        return
      }
      if (targetProblem) {
        setError(targetProblem)
        return
      }
      const coordinates = {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      }
      const selection = dispatchSelection(mission, coordinates)
      const destination = await model
        .world({
          type: 'ResolveDestination',
          selection,
        })
        .catch((failure: unknown) => {
          throw Error(dispatchFailure(failure))
        })
      if (requestGeneration !== generation.current) return
      if (!destination || !('type' in destination))
        throw Error('Destination unavailable.')
      const resolvedProblem = destinationError(
        mission,
        destination,
        view.binding.player,
        body.id,
      )
      if (resolvedProblem) {
        setError(resolvedProblem)
        return
      }
      if (
        draft?.target?.type === 'Body' &&
        (destination.type !== 'Body' ||
          destination.id !== draft.target.id ||
          destination.expected_owner !== draft.target.expected_owner ||
          destination.expected_kind !== draft.target.expected_kind)
      )
        throw Error(
          'The observed target has changed. Choose a current target in Galaxy.',
        )
      const cargoAmounts = addAllCargo
        ? ['0', '0', '0']
        : cargo.map(dispatchQuantity)
      const intent: S['FleetIntent4'] = {
        origin: body.id,
        destination,
        mission,
        ships: dispatchShips(types, ships, view.binding.player),
        cargo: {
          metal: (BigInt(cargoAmounts[0]) * 1000000n).toString(),
          crystal: (BigInt(cargoAmounts[1]) * 1000000n).toString(),
          deuterium: (BigInt(cargoAmounts[2]) * 1000000n).toString(),
        },
        speed_percent: speed as S['FleetIntent4']['speed_percent'],
      }
      const terms = await model
        .world({ type: 'FleetQuote', intent })
        .catch((failure: unknown) => {
          throw Error(dispatchFailure(failure, intent))
        })
      if (requestGeneration !== generation.current) return
      if (!terms || !('terms_hash' in terms))
        throw Error(
          'Unable to confirm this fleet quote. Review it again after reconnecting.',
        )
      if (addAllCargo) {
        const origin = projectGameView(model.store.getState())?.bodies.find(
          (candidate) => candidate.id === body.id,
        )
        if (!origin) return
        setCargo(
          allDispatchCargo(origin.amounts, terms.maximum_payload, terms.fuel),
        )
      } else setQuote(terms)
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(
          e instanceof Error ? e.message : 'Unable to quote this mission.',
        )
    } finally {
      if (requestGeneration === generation.current) setBusy(false)
    }
  }
  function pasteCoordinates(event: ClipboardEvent<HTMLInputElement>) {
    const parsed = parsePastedCoordinates(
      event.clipboardData.getData('text/plain'),
    )
    if (!parsed) return
    event.preventDefault()
    setGalaxy(parsed.galaxy)
    setSystem(parsed.system)
    setPosition(parsed.position)
    clear()
  }
  return {
    timing: timing?.terms,
    timingMessage: !coordinatesValid
      ? 'Enter a valid destination to see flight times.'
      : targetProblem ||
        (timingShips.length === 0
          ? 'Select ships to see flight times.'
          : timing?.error),
    addAllCargo: () => review(true),
    pasteCoordinates,
    targetName:
      mission !== 'Harvest' && mission !== 'Colonize'
        ? target?.name
        : undefined,
    colony,
    coordinateProblems,
    coordinatesValid,
    targetProblem,
    attackWarning,
    mission,
    setMission,
    galaxy,
    setGalaxy,
    system,
    setSystem,
    position,
    setPosition,
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
    quoteRef,
    reviewButtonRef,
    command,
    send,
    clear,
    review,
  }
}
