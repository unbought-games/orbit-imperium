import type { components } from '../contracts'
import { combatTechnologies, simulationFields } from './combat-simulation-model'
import { bodyName, coordinates } from '../ui/format'

type S = components['schemas']
type OwnedView = Pick<S['BoundView4'], 'research' | 'catalog' | 'as_of_ms'> & {
  bodies: Pick<
    S['BodyV3'],
    'id' | 'name' | 'kind' | 'coordinates' | 'inventories'
  >[]
}

/** Only the authenticated view's owned bodies may supply an import. Sparse
 * complete inventories/research mean zero; absent collections mean unavailable.
 * Returned values become user-authored draft inputs only on explicit import. */
export function ownedDefenderImport(
  view: OwnedView | null,
  bodyId: string | undefined,
  includeShips: boolean,
  stale: boolean,
) {
  const body = view?.bodies.find((candidate) => candidate.id === bodyId)
  if (stale || !view || !body || !body.inventories || !view.research)
    return {
      error:
        'Current owned-world data is unavailable. Reconnect or select an owned planet or moon.',
      values: null,
      source: null,
    }
  const fields = simulationFields(
    undefined,
    view.catalog,
    view.research,
  ).filter((field) => field.side === 'defender')
  const unsupported = body.inventories.some(
    ({ item, count }) =>
      (item.kind === 'Defense' || (includeShips && item.kind === 'Ship')) &&
      BigInt(count) > 0n &&
      !fields.some(
        (field) => field.item?.kind === item.kind && field.item.id === item.id,
      ),
  )
  if (unsupported)
    return {
      error:
        'This world has forces unsupported by the current combat rules. Import would omit them.',
      values: null,
      source: null,
    }
  const values = Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.item
        ? field.item.kind === 'Ship' && !includeShips
          ? '0'
          : (body.inventories.find(
              ({ item }) =>
                item.kind === field.item!.kind && item.id === field.item!.id,
            )?.count ?? '0')
        : String(
            view.research.find(
              ({ research }) =>
                research === combatTechnologies[field.technology!],
            )?.level ?? 0,
          ),
    ]),
  )
  return {
    error: null,
    values,
    moonTarget:
      body.kind === 'Moon'
        ? ('Moon' as const)
        : view.bodies.some(
              (candidate) =>
                candidate.kind === 'Moon' &&
                candidate.coordinates.galaxy === body.coordinates.galaxy &&
                candidate.coordinates.system === body.coordinates.system &&
                candidate.coordinates.position === body.coordinates.position,
            )
          ? ('PlanetWithMoon' as const)
          : ('PlanetWithoutMoon' as const),
    source: `${body.name ? `${body.kind} · ${bodyName(body)}` : body.kind} ${coordinates(body)} · ${includeShips ? 'with stationed ships' : 'without ships'} · snapshot ${new Date(view.as_of_ms).toLocaleString()}`,
  }
}

/** Replace only primary defender inputs. Allied and attacker edits are separate. */
export function replaceDefenderEdits(
  edits: Record<string, string>,
  values: Record<string, string>,
) {
  return {
    ...Object.fromEntries(
      Object.entries(edits).filter(([key]) => !key.startsWith('defender:')),
    ),
    ...values,
  }
}
