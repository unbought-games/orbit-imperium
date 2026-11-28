import type { BoundSettings } from '../client-model/commands'

export function shipDebrisRule(settings: BoundSettings | null) {
  if (settings?.protocol !== 4 || !settings.ship_debris) return null
  const { basis_points, deuterium_in_debris, moons_enabled } =
    settings.ship_debris
  const resources = deuterium_in_debris
    ? 'metal, crystal and deuterium'
    : 'metal and crystal'
  const moonRule = moons_enabled
    ? 'Only newly created metal and crystal debris count toward moon chance.'
    : 'Moons cannot form in this universe.'
  return `Destroyed ships leave ${basis_points / 100}% of their ${resources} build costs as debris. Carried cargo and fuel add nothing to the field. ${moonRule}`
}
