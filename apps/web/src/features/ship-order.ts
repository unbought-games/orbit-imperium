import type { components } from '../contracts'
type Entry = components['schemas']['CatalogEntry3']

export function shipGroup(entry: Entry) {
  if (!entry.mobile) return 'Stationary'
  if (entry.key.id === 'SmallCargo' || entry.key.id === 'LargeCargo')
    return 'Transports'
  if (['EspionageProbe', 'Recycler', 'ColonyShip'].includes(entry.key.id))
    return 'Utility'
  return 'Warships'
}
const groups = ['Warships', 'Transports', 'Utility', 'Stationary']
// Older catalogs omit costs; keep a stable name order in that case.
export function compareShips(a: Entry, b: Entry) {
  const group = groups.indexOf(shipGroup(a)) - groups.indexOf(shipGroup(b))
  if (group) return group
  const cost = (entry: Entry) =>
    entry.ship_statistics?.cost?.reduce(
      (sum, amount) => sum + BigInt(amount),
      0n,
    )
  const ac = cost(a),
    bc = cost(b)
  if (ac === undefined && bc !== undefined) return 1
  if (bc === undefined && ac !== undefined) return -1
  if (ac !== undefined && bc !== undefined && ac !== bc) return ac < bc ? -1 : 1
  return a.key.id.localeCompare(b.key.id)
}
