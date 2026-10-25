import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/gauss-cannon.json', import.meta.url)))

/** Add Gauss Cannon to an export with its prerequisite content already enabled. */
export function prepareGaussCannonRules(document) {
  const next = structuredClone(document)
  const artifact = next?.artifact
  const entry = (kind, id) => artifact?.catalog?.find(e => e.key.kind === kind && e.key.id === id)
  if (!next?.universe || !Number.isInteger(next.base_revision) || !Array.isArray(artifact?.catalog) || !artifact.progression?.research || !Array.isArray(artifact.progression.unit_costs) || !Array.isArray(artifact.world?.combat?.units)) {
    throw new Error('Expected a world rules export with a GaussCannon catalog entry')
  }
  const defense = entry('Defense', 'GaussCannon')
  if (!defense) throw new Error('Expected a world rules export with a GaussCannon catalog entry')
  if (!artifact.buildings?.Shipyard || !entry('Building', 'Shipyard')?.enabled) {
    throw new Error('Enable Shipyard before preparing Gauss Cannon')
  }
  for (const research of ['EnergyTechnology', 'WeaponsTechnology', 'ShieldingTechnology']) {
    if (!artifact.progression.research[research] || !entry('Research', research)?.enabled) {
      throw new Error(`Enable ${research} before preparing Gauss Cannon`)
    }
  }
  defense.enabled = true
  defense.mobile = false
  defense.requirements = structuredClone(content.requirements)
  const replace = (items, value) => {
    const index = items.findIndex(x => x.item.kind === 'Defense' && x.item.id === 'GaussCannon')
    if (index < 0) items.push(value)
    else items[index] = value
  }
  replace(artifact.progression.unit_costs, {
    item: { kind: 'Defense', id: 'GaussCannon' },
    cost: structuredClone(content.cost),
  })
  replace(artifact.world.combat.units, structuredClone(content.combat))
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-gauss-cannon-rules.mjs rules-before.json rules-gauss-cannon.json')
  fs.writeFileSync(output, JSON.stringify(prepareGaussCannonRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
