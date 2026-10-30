import type { components } from '../contracts'
import type { GameState } from './game-store'
import type { Coordinator } from './coordinator'
import { sameBinding } from './commands'
import { occupiedFleetSlots, projectGameView } from './game-projection'
import { dispatchFailure } from './dispatch-validation'

type S = components['schemas']
export type HarvestPosition = Pick<
  S['GalaxyPosition4'],
  'coordinates' | 'debris'
>

/** Galaxy debris and catalog cargo capacity are whole units, not micro-units. */
export function harvestSuggestion(
  metal: string,
  crystal: string,
  capacity: string,
  available: string,
) {
  const total = BigInt(metal) + BigInt(crystal)
  // Harvest in engine/missions.rs also caps collection at 20,000 per Recycler.
  const perShip = BigInt(capacity) < 20_000n ? BigInt(capacity) : 20_000n
  const needed = perShip > 0n ? (total + perShip - 1n) / perShip : 0n
  return {
    needed: needed.toString(),
    suggested: (needed < BigInt(available)
      ? needed
      : BigInt(available)
    ).toString(),
  }
}

export function galaxyHarvest(
  state: GameState,
  origin: string,
  position: HarvestPosition,
) {
  const body = projectGameView(state)?.bodies.find((body) => body.id === origin)
  const available =
    body?.inventories.find(
      (entry) => entry.item.kind === 'Ship' && entry.item.id === 'Recycler',
    )?.count ?? '0'
  const capacity =
    state.view?.protocol === 4
      ? state.view.catalog.find(
          (entry) => entry.key.kind === 'Ship' && entry.key.id === 'Recycler',
        )?.ship_statistics?.propulsion?.cargo_capacity
      : undefined
  const blockers: string[] = []
  if (
    !state.ready ||
    (state.stale && !state.rateLimited) ||
    state.view?.protocol !== 4
  )
    blockers.push('Reconnect before sending recyclers.')
  if (
    !state.view?.capabilities.some(
      (entry) => entry.capability === 'Harvest' && entry.enabled,
    )
  )
    blockers.push('Harvest missions are unavailable in this universe.')
  if (BigInt(available) === 0n)
    blockers.push('No recyclers available on the selected planet.')
  if (
    state.view?.protocol === 4 &&
    BigInt(occupiedFleetSlots(state)) >= BigInt(state.view.missions.fleet_slots)
  )
    blockers.push('No fleet slots available. Wait for a fleet to return.')
  if (
    !position.debris ||
    BigInt(position.debris.metal) + BigInt(position.debris.crystal) === 0n
  )
    blockers.push('There is no debris left to collect.')
  if (!capacity || BigInt(capacity) <= 0n)
    blockers.push(
      'Recycler capacity is unavailable. Use Customize to prepare this mission.',
    )
  const suggestion = harvestSuggestion(
    position.debris?.metal ?? '0',
    position.debris?.crystal ?? '0',
    capacity ?? '0',
    available,
  )
  return { available, ...suggestion, blockers }
}

export function harvestCountError(count: string, available: string) {
  if (!/^[1-9][0-9]*$/.test(count))
    return 'Enter a whole number of recyclers greater than zero.'
  if (BigInt(count) > BigInt(available))
    return 'Not enough recyclers available on the selected planet.'
  return null
}

/** Quote on the explicit Send gesture, then recheck inventory, slots, context and binding. */
export async function sendGalaxyHarvest(
  model: Pick<Coordinator, 'store' | 'world' | 'send'>,
  origin: string,
  position: HarvestPosition,
  count: string,
  current: () => boolean,
) {
  const state = model.store.getState(),
    binding = state.binding
  if (state.rateLimited) return
  const availability = galaxyHarvest(state, origin, position)
  const problem =
    availability.blockers[0] ?? harvestCountError(count, availability.available)
  if (problem) throw Error(problem)
  if (!binding || !position.debris || !current()) return
  const intent: S['FleetIntent4'] = {
    origin,
    destination: {
      type: 'Debris',
      coordinates: position.coordinates,
      field_identity: position.debris.field_identity,
    },
    mission: 'Harvest',
    ships: [{ owner: binding.player, ship_type: 'Recycler', count }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  }
  const terms = await model
    .world({ type: 'FleetQuote', intent })
    .catch((error: unknown) => {
      throw Error(dispatchFailure(error, intent))
    })
  const latest = model.store.getState()
  if (!current() || !latest.binding || !sameBinding(binding, latest.binding))
    return
  if (!terms || !('terms_hash' in terms) || !('intent' in terms))
    throw Error(
      'Unable to confirm this harvest mission. Try again after reconnecting.',
    )
  const checked = galaxyHarvest(latest, origin, position)
  const changed =
    checked.blockers[0] ?? harvestCountError(count, checked.available)
  if (changed) throw Error(changed)
  const id = await model.send(
    {
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent,
        expected_terms_hash: terms.terms_hash,
      },
    },
    terms,
  )
  // The shared cooldown banner owns throttled-send feedback.
  if (!id && model.store.getState().rateLimited) return
  if (!id)
    throw Error(
      model.store.getState().message ||
        'The harvest mission could not be sent.',
    )
  return id
}
