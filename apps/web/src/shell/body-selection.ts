import type { BoundView } from '../client-model/commands'
import { coordinates } from '../ui/format'

/** Starting/legacy planets have no colony genesis; keep them ahead of colonies.
 * Equal or unknown creation times retain server order. Moons follow their planet.
 * Never infer acquisition from UUIDs, coordinates, names, or resource checkpoints.
 */
export function orderedBodies(bodies: BoundView['bodies']) {
  const planets = bodies.filter((body) => body.kind === 'Planet')
  const createdAt = (body: BoundView['bodies'][number]) =>
    ('colony' in body ? body.colony?.created_at : undefined) ?? -1
  planets.sort((a, b) => createdAt(a) - createdAt(b))
  const moons = bodies.filter((body) => body.kind === 'Moon')
  const positions = new Set(planets.map(coordinates))
  return [
    ...planets.flatMap((planet) => [
      planet,
      ...moons.filter((moon) => coordinates(moon) === coordinates(planet)),
    ]),
    ...moons.filter((moon) => !positions.has(coordinates(moon))),
  ]
}
