import fs from 'node:fs'
import { addSatelliteRapidFire } from './prepare-solar-satellite-rules.mjs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(
  fs.readFileSync(new URL('../rules/content/cruiser.json', import.meta.url)),
)

/** Add Cruisers to an exported universe without replacing custom rules. */
export function prepareCruiserRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(
    (e) => e.key.kind === 'Ship' && e.key.id === 'Cruiser',
  )
  if (
    !next.universe ||
    !Number.isInteger(next.base_revision) ||
    !artifact?.world?.combat ||
    !artifact?.progression ||
    !entry
  ) {
    throw new Error(
      'Expected a world rules export with a Cruiser catalog entry',
    )
  }
  if (
    !artifact.buildings?.Shipyard ||
    !artifact.catalog.some(
      (e) => e.key.kind === 'Building' && e.key.id === 'Shipyard' && e.enabled,
    )
  )
    throw new Error('Enable Shipyard before preparing Cruisers')
  for (const id of ['IonTechnology', 'ImpulseDrive']) {
    if (
      !artifact.progression.research[id] ||
      !artifact.catalog.some(
        (e) => e.key.kind === 'Research' && e.key.id === id && e.enabled,
      )
    ) {
      throw new Error(`Enable ${id} before preparing Cruisers`)
    }
  }
  artifact.ships.Cruiser = structuredClone(content.ship)
  entry.enabled = true
  entry.mobile = true
  entry.requirements = structuredClone(content.requirements)
  const item = { kind: 'Ship', id: 'Cruiser' }
  const replace = (items, value, match) => {
    const index = items.findIndex(match)
    if (index < 0) items.push(value)
    else items[index] = value
  }
  const sameItem = (x) => x.item.kind === item.kind && x.item.id === item.id
  replace(
    artifact.progression.unit_costs,
    { item, cost: structuredClone(content.cost) },
    sameItem,
  )
  replace(
    artifact.world.combat.units,
    structuredClone(content.combat),
    sameItem,
  )
  for (const rule of content.rapid_fire) {
    replace(
      artifact.world.combat.rapid_fire,
      structuredClone(rule),
      (x) =>
        x.shooter.kind === rule.shooter.kind &&
        x.shooter.id === rule.shooter.id &&
        x.target.kind === rule.target.kind &&
        x.target.id === rule.target.id,
    )
  }
  addSatelliteRapidFire(artifact, 'Cruiser')
  return next
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4)
    throw new Error(
      'Usage: node scripts/prepare-cruiser-rules.mjs rules-before.json rules-cruiser.json',
    )
  fs.writeFileSync(
    output,
    JSON.stringify(
      prepareCruiserRules(JSON.parse(fs.readFileSync(input))),
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
}
