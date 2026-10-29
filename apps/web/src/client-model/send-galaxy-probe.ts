import type { Coordinator } from './coordinator'
import type { components } from '../contracts'
import { sameBinding } from './commands'
import { dispatchFailure } from './dispatch-validation'
import { pendingProbe, probeAvailability } from './galaxy-fleets'

type S = components['schemas']
type ProbeModel = Pick<Coordinator, 'store' | 'world' | 'send'>

/** One explicit click, one durable departure; server quotes still validate fuel and eligibility. */
export async function sendGalaxyProbe(
  model: ProbeModel,
  origin: string,
  target: NonNullable<S['GalaxyPosition4']['body']>,
  current: () => boolean,
) {
  const state = model.store.getState()
  if (state.rateLimited) return
  const binding = state.binding
  const blocked = probeAvailability(state, origin)
  if (blocked) throw Error(blocked)
  if (!binding || !current()) return
  if (target.owner === binding.player)
    throw Error('You cannot spy on your own planet.')
  if (!target.espionage_eligible)
    throw Error('Espionage is unavailable for this planet.')
  if (pendingProbe(state, origin, target.id)) return
  const intent: S['FleetIntent4'] = {
    origin,
    destination: {
      type: 'Body',
      id: target.id,
      expected_owner: target.owner,
      expected_kind: target.kind,
    },
    mission: 'Espionage',
    ships: [{ owner: binding.player, ship_type: 'EspionageProbe', count: '1' }],
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
  if (!terms || !('terms_hash' in terms))
    throw Error(
      'Unable to confirm the probe departure. Try again after reconnecting.',
    )
  const commandId = await model.send(
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
  if (!commandId && model.store.getState().rateLimited) return
  if (!commandId)
    throw Error(
      model.store.getState().message ||
        'The probe could not be sent. Check available probes and fleet slots.',
    )
  return commandId
}
