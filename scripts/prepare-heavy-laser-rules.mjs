import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/heavy-laser.json', import.meta.url)))

/** Add Heavy Laser to an export with its prerequisite content already enabled. */
export function prepareHeavyLaserRules(document) {
  const next = structuredClone(document)
  const artifact = next?.artifact
  const entry = (kind, id) => artifact?.catalog?.find(e => e.key.kind === kind && e.key.id === id)
  if (!next?.universe || !Number.isInteger(next.base_revision) || !Array.isArray(artifact?.catalog) || !artifact.progression?.research || !Array.isArray(artifact.progression.unit_costs) || !Array.isArray(artifact.world?.combat?.units)) {
    throw new Error('Expected a world rules export with a HeavyLaser catalog entry')
  }
  const defense = entry('Defense', 'HeavyLaser')
  if (!defense) throw new Error('Expected a world rules export with a HeavyLaser catalog entry')
  if (!artifact.buildings?.Shipyard || !entry('Building', 'Shipyard')?.enabled) {
    throw new Error('Enable Shipyard before preparing Heavy Laser')
  }
  for (const id of ['EnergyTechnology', 'LaserTechnology']) {
    if (!artifact.progression.research[id] || !entry('Research', id)?.enabled) {
      throw new Error(`Enable ${id} before preparing Heavy Laser`)
    }
  }
  defense.enabled = true
  defense.mobile = false
  defense.requirements = structuredClone(content.requirements)
  const replace = (items, value) => {
    const index = items.findIndex(x => x.item.kind === 'Defense' && x.item.id === 'HeavyLaser')
    if (index < 0) items.push(value)
    else items[index] = value
  }
  replace(artifact.progression.unit_costs, {
    item: { kind: 'Defense', id: 'HeavyLaser' },
    cost: structuredClone(content.cost),
  })
  replace(artifact.world.combat.units, structuredClone(content.combat))
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-heavy-laser-rules.mjs rules-before.json rules-heavy-laser.json')
  fs.writeFileSync(output, JSON.stringify(prepareHeavyLaserRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
