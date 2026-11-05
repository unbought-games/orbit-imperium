import { validateGalaxySearch } from './galaxy-location'
import {
  validateLocationIntent,
  readAddress,
  type LocationIntent,
} from './location-address'
import type { DispatchDraft } from '../features/missions'
export function validateDispatchSearch(
  search: Record<string, unknown>,
): ReturnType<typeof validateGalaxySearch> &
  LocationIntent & {
    attackGroup?: string
    site?: string
    siteRevision?: string
  } {
  if (
    (search.site !== undefined || search.siteRevision !== undefined) &&
    (typeof search.site !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(search.site) ||
      typeof search.siteRevision !== 'string' ||
      !/^(0|[1-9][0-9]*)$/.test(search.siteRevision))
  )
    throw new Error(
      'This address contains an invalid personal site selection. Return to opening guidance for the current briefing.',
    )
  return {
    ...validateGalaxySearch(search),
    site:
      typeof search.site === 'string' && /^[0-9a-f-]{36}$/i.test(search.site)
        ? search.site
        : undefined,
    siteRevision:
      typeof search.siteRevision === 'string' &&
      /^(0|[1-9][0-9]*)$/.test(search.siteRevision)
        ? search.siteRevision
        : undefined,
    ...validateLocationIntent(search),
    attackGroup:
      typeof search.attackGroup === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.attackGroup)
        ? search.attackGroup
        : undefined,
  }
}
export function dispatchSearch(draft: DispatchDraft) {
  return {
    ...draft.coordinates,
    ...(draft.target?.type === 'Site'
      ? {
          site: draft.target.selection.id,
          siteRevision: draft.target.selection.expected_revision,
        }
      : {}),
    attackGroup: draft.attackGroup,
    mission: draft.mission,
    target:
      draft.targetKind ??
      (draft.target?.type === 'Body' && draft.target.expected_kind === 'Moon'
        ? 'moon'
        : draft.mission === 'Harvest'
          ? 'debris'
          : 'planet'),
  } as const
}
export function draftFromSearch(
  search: {
    attackGroup?: string
    site?: string
    siteRevision?: string
    galaxy?: number
    system?: number
    position?: number
  } & LocationIntent,
): DispatchDraft | null {
  const coordinates = readAddress(
    `${search.galaxy}:${search.system}:${search.position}`,
  )
  return coordinates
    ? {
        coordinates,
        ...(search.site && search.siteRevision
          ? {
              target: {
                type: 'Site' as const,
                selection: {
                  id: search.site,
                  expected_revision: search.siteRevision,
                },
              },
              mission: 'Attack' as const,
            }
          : {}),
        attackGroup: search.attackGroup,
        targetKind: search.target ?? 'planet',
        mission:
          (search.site ? 'Attack' : search.mission) ??
          (search.target === 'debris' ? 'Harvest' : 'Transport'),
      }
    : null
}
