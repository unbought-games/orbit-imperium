import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/ion-cannon.json', import.meta.url)))

/** Add Ion Cannon to an export with its prerequisite content already enabled. */
export function prepareIonCannonRules(document) {
  const next = structuredClone(document)
  const artifact = next?.artifact
  const entry = (kind, id) => artifact?.catalog?.find(e => e.key.kind === kind && e.key.id === id)
  if (!next?.universe || !Number.isInteger(next.base_revision) || !Array.isArray(artifact?.catalog) || !artifact.progression?.research || !Array.isArray(artifact.progression.unit_costs) || !Array.isArray(artifact.world?.combat?.units)) {
    throw new Error('Expected a world rules export with an IonCannon catalog entry')
  }
  const defense = entry('Defense', 'IonCannon')
  if (!defense) throw new Error('Expected a world rules export with an IonCannon catalog entry')
  if (!artifact.buildings?.Shipyard || !entry('Building', 'Shipyard')?.enabled) {
    throw new Error('Enable Shipyard before preparing Ion Cannon')
  }
  if (!artifact.progression.research.IonTechnology || !entry('Research', 'IonTechnology')?.enabled) {
    throw new Error('Enable IonTechnology before preparing Ion Cannon')
  }
  defense.enabled = true
  defense.mobile = false
  defense.requirements = structuredClone(content.requirements)
  const replace = (items, value) => {
    const index = items.findIndex(x => x.item.kind === 'Defense' && x.item.id === 'IonCannon')
    if (index < 0) items.push(value)
    else items[index] = value
  }
  replace(artifact.progression.unit_costs, {
    item: { kind: 'Defense', id: 'IonCannon' },
    cost: structuredClone(content.cost),
  })
  replace(artifact.world.combat.units, structuredClone(content.combat))
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-ion-cannon-rules.mjs rules-before.json rules-ion-cannon.json')
  fs.writeFileSync(output, JSON.stringify(prepareIonCannonRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
