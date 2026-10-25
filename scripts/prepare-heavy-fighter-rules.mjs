import fs from 'node:fs'
import { addSatelliteRapidFire } from './prepare-solar-satellite-rules.mjs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(
  fs.readFileSync(
    new URL('../rules/content/heavy-fighter.json', import.meta.url),
  ),
)

/** Add Heavy Fighters to an exported universe without replacing custom rules. */
export function prepareHeavyFighterRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(
    (e) => e.key.kind === 'Ship' && e.key.id === 'HeavyFighter',
  )
  if (
    !next.universe ||
    !Number.isInteger(next.base_revision) ||
    !artifact?.world?.combat ||
    !artifact?.progression ||
    !entry
  ) {
    throw new Error(
      'Expected a world rules export with a HeavyFighter catalog entry',
    )
  }
  for (const id of ['ArmourTechnology', 'ImpulseDrive']) {
    if (
      !artifact.progression.research[id] ||
      !artifact.catalog.some(
        (e) => e.key.kind === 'Research' && e.key.id === id && e.enabled,
      )
    ) {
      throw new Error(`Enable ${id} before preparing Heavy Fighters`)
    }
  }
  artifact.ships.HeavyFighter = structuredClone(content.ship)
  entry.enabled = true
  entry.mobile = true
  entry.requirements = structuredClone(content.requirements)
  const item = { kind: 'Ship', id: 'HeavyFighter' }
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
  addSatelliteRapidFire(artifact, 'HeavyFighter')
  return next
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4)
    throw new Error(
      'Usage: node scripts/prepare-heavy-fighter-rules.mjs rules-before.json rules-heavy-fighter.json',
    )
  fs.writeFileSync(
    output,
    JSON.stringify(
      prepareHeavyFighterRules(JSON.parse(fs.readFileSync(input))),
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
}
