import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import type { Espionage, SimulationField } from './combat-simulation-model'
import { label } from '../ui/format'
import { coordinateFields } from '../ui/coordinate-input-model'
import { coordinateErrors } from '../client-model/dispatch-validation'
type S = components['schemas']

export function simulationDestination(
  text: string,
  settings: Pick<
    S['BoundSettings4'],
    'galaxies' | 'systems_per_galaxy' | 'positions_per_system'
  > | null,
): { coordinates: S['Coordinates'] | null; problem: string } {
  if (!text.trim())
    return {
      coordinates: null,
      problem: 'Enter destination coordinates to estimate flight.',
    }
  const fields = coordinateFields(text)
  const problem =
    Object.values(coordinateErrors(fields, settings)).find(Boolean) ?? ''
  return {
    coordinates: problem
      ? null
      : {
          galaxy: Number(fields.galaxy),
          system: Number(fields.system),
          position: Number(fields.position),
        },
    problem,
  }
}

/** Travel uses selected ships and the real origin; never simulated research or survivors. */
export function simulationFlightDraft(
  report: Espionage | undefined,
  fields: SimulationField[],
  edits: Record<string, string>,
  body: S['BodyV3'] | undefined,
  speed: number,
  destination?: { coordinates: S['Coordinates']; kind: 'Planet' | 'Moon' },
): { draft: DispatchDraft | null; problem: string } {
  if (!body)
    return { draft: null, problem: 'Select an origin to estimate flight.' }
  const ships: Record<string, string> = {}
  for (const field of fields) {
    if (field.side !== 'attacker' || field.item?.kind !== 'Ship') continue
    const count = edits[field.key] ?? field.value ?? ''
    if (!/^(0|[1-9][0-9]*)$/.test(count))
      return {
        draft: null,
        problem: 'Enter whole nonnegative attacking ship counts.',
      }
    if (BigInt(count) === 0n) continue
    ships[field.item.id] = count
  }
  if (!Object.keys(ships).length)
    return {
      draft: null,
      problem:
        'Select attacking ships to estimate flight and prepare an attack.',
    }
  if (!report && !destination)
    return {
      draft: null,
      problem: 'Enter destination coordinates to estimate flight.',
    }
  return {
    problem: '',
    draft: {
      origin: body.id,
      ships,
      speed,
      mission: 'Attack',
      coordinates: report?.target.coordinates ?? destination!.coordinates,
      targetKind:
        (report?.target.kind ?? destination!.kind) === 'Moon'
          ? 'moon'
          : 'planet',
      ...(report
        ? {
            observedAt: report.observed_at,
            target: {
              type: 'Body',
              id: report.target.body,
              expected_owner: report.target.owner,
              expected_kind: report.target.kind,
            },
          }
        : {}),
    },
  }
}

/** Inventory limits attack preparation, never the advisory arithmetic. */
export function simulationAttackProblem(
  draft: DispatchDraft,
  body: S['BodyV3'],
): string {
  for (const [ship, count] of Object.entries(draft.ships ?? {})) {
    const available =
      body.inventories.find((u) => u.item.kind === 'Ship' && u.item.id === ship)
        ?.count ?? '0'
    if (BigInt(count) > BigInt(available))
      return `${label(ship)}: ${count} selected, ${available} stationed at this origin. Flight estimates include hypothetical ships. Reduce the selection to prepare an attack.`
  }
  return ''
}
