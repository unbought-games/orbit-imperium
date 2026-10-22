import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/colonization.json', import.meta.url)))

/** Add the reviewed colony profile to a real export without replacing its universe. */
export function prepareColonizationRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(e => e.key.kind === 'Ship' && e.key.id === 'ColonyShip')
  if (!next.universe || !Number.isInteger(next.base_revision) || !artifact?.world?.combat || !artifact?.progression || !entry) {
    throw new Error('Expected a world rules export with a ColonyShip catalog entry')
  }
  for (const id of ['ImpulseDrive', 'Astrophysics']) {
    if (!artifact.progression.research[id] || !artifact.catalog.some(e => e.key.kind === 'Research' && e.key.id === id && e.enabled)) {
      throw new Error(`Enable ${id} before preparing colonization`)
    }
  }
  artifact.world.colonization = structuredClone(content.colonization)
  artifact.ships.ColonyShip = structuredClone(content.ship)
  entry.enabled = true
  entry.mobile = true
  entry.requirements = structuredClone(content.requirements)
  const item = { kind: 'Ship', id: 'ColonyShip' }
  const replace = (items, value, match) => {
    const index = items.findIndex(match)
    if (index < 0) items.push(value)
    else items[index] = value
  }
  const sameItem = x => x.item.kind === item.kind && x.item.id === item.id
  replace(artifact.progression.unit_costs, { item, cost: structuredClone(content.cost) }, sameItem)
  replace(artifact.world.combat.units, structuredClone(content.combat), sameItem)
  replace(artifact.world.combat.rapid_fire, structuredClone(content.rapid_fire), x => x.shooter.kind === 'Ship' && x.shooter.id === 'ColonyShip' && x.target.kind === 'Ship' && x.target.id === 'EspionageProbe')
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-colonization-rules.mjs rules-before.json rules-colonization.json')
  fs.writeFileSync(output, JSON.stringify(prepareColonizationRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
