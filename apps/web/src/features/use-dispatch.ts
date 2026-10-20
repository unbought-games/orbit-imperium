import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { Command } from '../client-model/commands'
import { currentServerTime } from '../client-model/game-projection'
import type { DispatchDraft } from './missions'
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
  }
  async function review() {
    const requestGeneration = ++generation.current
    setError('')
    setQuote(null)
    setBusy(true)
    try {
      if (
        ![galaxy, system, position].every((value) =>
          /^[1-9][0-9]*$/.test(value),
        )
      )
        throw Error('Enter whole system and position numbers.')
      const coordinates = {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      }
      const selection: S['DestinationSelection4'] =
        mission === 'Harvest'
          ? { type: 'DebrisAt', coordinates }
          : { type: 'BodyAt', coordinates, kind: 'Planet' }
      const destination = await model.world({
        type: 'ResolveDestination',
        selection,
      })
      if (requestGeneration !== generation.current) return
      if (!destination || !('type' in destination))
        throw Error('Destination unavailable.')
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
      if (
        cargo.some((n) => !/^(0|[1-9][0-9]*)$/.test(n)) ||
        Object.values(ships).some((n) => !/^(0|[1-9][0-9]*)$/.test(n))
      )
        throw Error('Enter whole nonnegative cargo and ship counts.')
      const intent: S['FleetIntent4'] = {
        origin: body.id,
        destination,
        mission,
        ships: types
          .filter((k) => BigInt(ships[k] ?? '0') > 0n)
          .map((ship_type) => ({
            owner: view.binding.player,
            ship_type,
            count: ships[ship_type],
          })),
        cargo: {
          metal: (BigInt(cargo[0]) * 1000000n).toString(),
          crystal: (BigInt(cargo[1]) * 1000000n).toString(),
          deuterium: (BigInt(cargo[2]) * 1000000n).toString(),
        },
        speed_percent: speed as S['FleetIntent4']['speed_percent'],
      }
      const terms = await model.world({ type: 'FleetQuote', intent })
      if (requestGeneration !== generation.current) return
      if (!terms || !('terms_hash' in terms))
        throw Error(
          'Unable to confirm this fleet quote. Review it again after reconnecting.',
        )
      setQuote(terms)
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(
          e instanceof Error ? e.message : 'Unable to quote this mission.',
        )
    } finally {
      if (requestGeneration === generation.current) setBusy(false)
    }
  }
  return {
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
    clear,
    review,
  }
}
