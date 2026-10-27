import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import type { Espionage, SimulationField } from './combat-simulation-model'
import { label } from '../ui/format'
type S = components['schemas']

/** Only the player's ship edits cross into Dispatch; never simulated research or survivors. */
export function simulationAttackDraft(
  report: Espionage,
  fields: SimulationField[],
  edits: Record<string, string>,
  body: S['BodyV3'] | undefined,
  speed: number,
): { draft: DispatchDraft | null; problem: string } {
  if (!body)
    return { draft: null, problem: 'Select an origin to prepare an attack.' }
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
    const available =
      body.inventories.find(
        (u) => u.item.kind === 'Ship' && u.item.id === field.item!.id,
      )?.count ?? '0'
    if (BigInt(count) > BigInt(available))
      return {
        draft: null,
        problem: `${label(field.label)}: ${count} selected, ${available} stationed at this origin. Reduce the selection to estimate flight or prepare an attack; hypothetical fleets can still be simulated.`,
      }
    ships[field.item.id] = count
  }
  if (!Object.keys(ships).length)
    return {
      draft: null,
      problem:
        'Select attacking ships to estimate flight and prepare an attack.',
    }
  return {
    problem: '',
    draft: {
      origin: body.id,
      ships,
      speed,
      mission: 'Attack',
      coordinates: report.target.coordinates,
      targetKind: report.target.kind === 'Moon' ? 'moon' : 'planet',
      observedAt: report.observed_at,
      target: {
        type: 'Body',
        id: report.target.body,
        expected_owner: report.target.owner,
        expected_kind: report.target.kind,
      },
    },
  }
}
