import type { components } from '../../contracts'
import type { TutorialData } from '../../client-model/tutorial-engine'
import type { DispatchDraft } from '../missions'

type S = components['schemas']
export type PersonalSite = S['TutorialSite4']

export function siteLocation(site: PersonalSite) {
  return {
    ...site.site.destination.coordinates,
    site: site.site.destination.selection.id,
  }
}

export function sitesAtPosition(
  data: TutorialData | null,
  coordinates: S['Coordinates'],
) {
  return (data?.sites ?? []).filter(({ site }) => {
    const c = site.destination.coordinates
    return (
      c.galaxy === coordinates.galaxy &&
      c.system === coordinates.system &&
      c.position === coordinates.position
    )
  })
}

export function personalSiteTitle(site: PersonalSite) {
  return site.title
}

export function personalSiteStatus(site: PersonalSite) {
  return site.site.retired
    ? 'Completed'
    : site.busy
      ? 'Mission in progress'
      : 'Available'
}

export function siteDispatchDraft(
  site: PersonalSite,
  origin: string,
): DispatchDraft | null {
  if (site.site.retired || site.busy) return null
  return {
    origin,
    mission: 'Attack',
    coordinates: site.site.destination.coordinates,
    target: { type: 'Site', selection: site.site.destination.selection },
    ships: Object.fromEntries(
      site.recommended_ships.map((ship) => [ship, '1']),
    ),
  }
}
