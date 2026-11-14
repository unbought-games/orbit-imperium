import type { Attempt, Command } from '../client-model/commands'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { DispatchDraft } from './missions'
import type { LocationKind } from '../shell/location-address'
import {
  allDispatchCargo,
  maxDispatchCargo,
} from '../client-model/dispatch-cargo'
import { resourceNames } from '../client-model/resources'
import {
  dispatchShips,
  dispatchSelection,
} from '../client-model/dispatch-timing'
import {
  destinationError,
  dispatchFailure,
  dispatchObservationError,
  dispatchQuantity,
  dispatchResourceProblem,
} from '../client-model/dispatch-validation'
type S = components['schemas']
export type DispatchReviewInput = {
  coordinateProblems: Record<string, string>
  targetProblem: string
  galaxy: string
  system: string
  position: string
  targetKind: LocationKind
  mission: S['Mission4']
  holdHours: NonNullable<S['FleetIntent4']['hold_hours']>
  speed: number
  types: S['FleetIntent4']['ships'][number]['ship_type'][]
  ships: Record<string, string>
  cargo: string[]
  player: string
  originId: string
  draft: DispatchDraft | null
  siteId?: string
  siteSelection?: S['SiteSelection4']
  estimate?: S['FleetTerms4'] | S['FleetEstimate4']
}
export type DispatchReviewPorts = {
  world: Coordinator['world']
  origin: () => Pick<S['BodyV3'], 'amounts'> | undefined
  quote: (terms: S['FleetTerms4']) => void
  cargo: (amounts: string[]) => void
  error: (message: string) => void
  busy: (busy: boolean) => void
  clear: () => void
  refreshSite: () => void
}
export type DispatchSubmission = {
  key: string
  generation: number
  coordinates: S['Coordinates']
}
export type DispatchSubmitPorts = {
  attempts: () => ReadonlyMap<string, unknown>
  send: Coordinator['send']
  submitted: (submission: DispatchSubmission | null) => void
  closeReview: () => void
}
export type DispatchCargoFill = 'all' | (typeof resourceNames)[number]

/** Owns request identity only. Draft edits and authoritative game data stay with their owners. */
export class DispatchRequests {
  private generation = 0
  invalidate() {
    return ++this.generation
  }
  isCurrent(generation: number) {
    return generation === this.generation
  }

  shouldResetDraft(
    submitted: DispatchSubmission | null,
    status: Attempt['status'] | undefined,
  ) {
    return (
      !!submitted &&
      status === 'committed' &&
      this.isCurrent(submitted.generation)
    )
  }

  async prepare(
    refresh: () => Promise<void>,
    review: () => Promise<void>,
    ports: Pick<DispatchReviewPorts, 'busy' | 'error'>,
  ) {
    const generation = this.invalidate()
    ports.busy(true)
    try {
      await refresh()
      if (this.isCurrent(generation)) await review()
    } catch {
      if (this.isCurrent(generation))
        ports.error(
          'Unable to refresh your fleet. Review it again after reconnecting.',
        )
    } finally {
      if (this.isCurrent(generation)) ports.busy(false)
    }
  }

  async submit(
    command: Command,
    quote: S['FleetTerms4'],
    coordinates: S['Coordinates'],
    ports: DispatchSubmitPorts,
  ) {
    const generation = this.invalidate()
    ports.closeReview()
    const previousAttempts = ports.attempts()
    const sending = ports.send(command, quote)
    // Coordinator registers before its first await. Never attach another invocation's receipt.
    const key = [...ports.attempts().keys()].find(
      (key) => !previousAttempts.has(key),
    )
    if (key) ports.submitted({ key, generation, coordinates })
    const id = await sending
    if (!id && this.isCurrent(generation)) ports.submitted(null)
  }

  async review(
    input: DispatchReviewInput,
    ports: DispatchReviewPorts,
    fillCargo?: DispatchCargoFill,
  ) {
    const requestGeneration = this.invalidate()
    ports.clear()
    ports.error('')
    ports.busy(true)
    const {
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
      player,
      originId,
      draft,
      siteId,
      siteSelection,
      estimate,
    } = input
    try {
      const coordinateProblem = Object.values(coordinateProblems).find(Boolean)
      if (coordinateProblem) {
        ports.error(coordinateProblem)
        return
      }
      if (targetProblem) {
        ports.error(targetProblem)
        return
      }
      const coordinates = {
        galaxy: Number(galaxy),
        system: Number(system),
        position: Number(position),
      }
      const selection = dispatchSelection(
        mission,
        coordinates,
        targetKind === 'moon' ? 'Moon' : 'Planet',
      )
      const destination = await ports
        .world(
          siteSelection
            ? { type: 'ResolveMissionSite', selection: siteSelection }
            : {
                type: 'ResolveDestination',
                selection,
              },
        )
        .catch((failure: unknown) => {
          throw Error(
            siteId && failure instanceof Error && failure.message === 'Conflict'
              ? 'The site changed. Refresh the briefing in opening guidance, then review again.'
              : dispatchFailure(failure),
          )
        })
      if (!this.isCurrent(requestGeneration)) return
      if (!destination || !('type' in destination))
        throw Error('Destination unavailable.')
      const resolvedProblem = destinationError(
        mission,
        destination,
        player,
        originId,
      )
      if (resolvedProblem) {
        ports.error(resolvedProblem)
        return
      }
      const observationProblem = dispatchObservationError(
        draft,
        selection,
        destination,
      )
      if (observationProblem) throw Error(observationProblem)
      const cargoAmounts = fillCargo
        ? ['0', '0', '0']
        : cargo.map(dispatchQuantity)
      const intent: S['FleetIntent4'] = {
        origin: originId,
        ...(draft?.attackGroup ? { attack_group: draft.attackGroup } : {}),
        destination,
        mission,
        ...(mission === 'Hold' ? { hold_hours: holdHours } : {}),
        ships: dispatchShips(types, ships, player),
        cargo: {
          metal: (BigInt(cargoAmounts[0]) * 1000000n).toString(),
          crystal: (BigInt(cargoAmounts[1]) * 1000000n).toString(),
          deuterium: (BigInt(cargoAmounts[2]) * 1000000n).toString(),
        },
        speed_percent: speed as S['FleetIntent4']['speed_percent'],
      }
      const terms = await ports
        .world({ type: fillCargo ? 'FleetEstimate' : 'FleetQuote', intent })
        .catch(async (failure: unknown) => {
          const code = failure instanceof Error ? failure.message : failure
          const resourceEstimate =
            code === 'InsufficientResources'
              ? (estimate ??
                (await ports
                  .world({ type: 'FleetEstimate', intent })
                  .catch(() => null)))
              : null
          const origin = ports.origin()
          const resourceProblem =
            resourceEstimate && 'fuel' in resourceEstimate && origin
              ? dispatchResourceProblem(
                  origin.amounts,
                  intent.cargo,
                  resourceEstimate.fuel,
                )
              : ''
          throw Error(resourceProblem || dispatchFailure(failure, intent))
        })
      if (!this.isCurrent(requestGeneration)) return
      if (!terms || !('maximum_payload' in terms))
        throw Error(
          'Unable to confirm this fleet quote. Review it again after reconnecting.',
        )
      if (fillCargo) {
        const origin = ports.origin()
        if (!origin) return
        ports.cargo(
          fillCargo === 'all'
            ? allDispatchCargo(
                origin.amounts,
                terms.maximum_payload,
                terms.fuel,
                cargo,
              )
            : maxDispatchCargo(
                origin.amounts,
                terms.maximum_payload,
                terms.fuel,
                cargo,
                fillCargo,
              ),
        )
      } else if ('terms_hash' in terms) ports.quote(terms)
      else throw Error('Unable to confirm this fleet quote. Review it again.')
    } catch (e) {
      if (siteId) ports.refreshSite()
      if (this.isCurrent(requestGeneration))
        ports.error(
          e instanceof Error ? e.message : 'Unable to quote this mission.',
        )
    } finally {
      if (this.isCurrent(requestGeneration)) ports.busy(false)
    }
  }
}
