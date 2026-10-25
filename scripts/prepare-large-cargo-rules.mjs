import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(
  fs.readFileSync(
    new URL('../rules/content/large-cargo.json', import.meta.url),
  ),
)

/** Add Large Cargos to an exported universe without replacing custom rules. */
export function prepareLargeCargoRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(
    (e) => e.key.kind === 'Ship' && e.key.id === 'LargeCargo',
  )
  if (
    !next.universe ||
    !Number.isInteger(next.base_revision) ||
    !artifact?.world?.combat ||
    !artifact?.progression ||
    !entry
  ) {
    throw new Error(
      'Expected a world rules export with a LargeCargo catalog entry',
    )
  }
  if (
    !artifact.buildings?.Shipyard ||
    !artifact.catalog.some(
      (e) => e.key.kind === 'Building' && e.key.id === 'Shipyard' && e.enabled,
    )
  )
    throw new Error('Enable Shipyard before preparing Large Cargos')
  for (const id of ['CombustionDrive']) {
    if (
      !artifact.progression.research[id] ||
      !artifact.catalog.some(
        (e) => e.key.kind === 'Research' && e.key.id === id && e.enabled,
      )
    ) {
      throw new Error(`Enable ${id} before preparing Large Cargos`)
    }
  }
  artifact.ships.LargeCargo = structuredClone(content.ship)
  entry.enabled = true
  entry.mobile = true
  entry.requirements = structuredClone(content.requirements)
  const item = { kind: 'Ship', id: 'LargeCargo' }
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
  return next
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4)
    throw new Error(
      'Usage: node scripts/prepare-large-cargo-rules.mjs rules-before.json rules-large-cargo.json',
    )
  fs.writeFileSync(
    output,
    JSON.stringify(
      prepareLargeCargoRules(JSON.parse(fs.readFileSync(input))),
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
}
