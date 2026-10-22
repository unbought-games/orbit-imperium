import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/light-laser.json', import.meta.url)))

/** Enable Laser Technology and Light Laser together on an exported universe. */
export function prepareLightLaserRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = (kind, id) => artifact?.catalog?.find(e => e.key.kind === kind && e.key.id === id)
  const laser = entry('Research', 'LaserTechnology')
  const defense = entry('Defense', 'LightLaser')
  if (!next.universe || !Number.isInteger(next.base_revision) || !artifact?.progression?.research || !Array.isArray(artifact.progression.unit_costs) || !Array.isArray(artifact.world?.combat?.units) || !laser || !defense) {
    throw new Error('Expected a world rules export with LaserTechnology and LightLaser catalog entries')
  }
  for (const id of ['RoboticsFactory', 'ResearchLab', 'Shipyard']) {
    if (!artifact.buildings?.[id] || !entry('Building', id)?.enabled) {
      throw new Error(`Enable ${id} before preparing Light Laser`)
    }
  }
  if (!artifact.progression.research.EnergyTechnology || !entry('Research', 'EnergyTechnology')?.enabled) {
    throw new Error('Enable EnergyTechnology before preparing Light Laser')
  }
  artifact.progression.research.LaserTechnology = structuredClone(content.research.definition)
  laser.enabled = true
  laser.requirements = structuredClone(content.research.requirements)
  defense.enabled = true
  defense.mobile = false
  defense.requirements = structuredClone(content.defense.requirements)
  const replace = (items, value) => {
    const index = items.findIndex(x => x.item.kind === 'Defense' && x.item.id === 'LightLaser')
    if (index < 0) items.push(value)
    else items[index] = value
  }
  replace(artifact.progression.unit_costs, {
    item: { kind: 'Defense', id: 'LightLaser' },
    cost: structuredClone(content.defense.cost),
  })
  replace(artifact.world.combat.units, structuredClone(content.defense.combat))
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-light-laser-rules.mjs rules-before.json rules-light-laser.json')
  fs.writeFileSync(output, JSON.stringify(prepareLightLaserRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
