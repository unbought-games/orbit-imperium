import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/solar-satellite.json', import.meta.url)))

/** Enable stationary satellites without replacing other universe content. */
export function prepareSolarSatelliteRules(document) {
  const next = structuredClone(document)
  const a = next.artifact
  const entry = a?.catalog?.find((e) => e.key.kind === 'Ship' && e.key.id === 'SolarSatellite')
  if (!next.universe || !Number.isInteger(next.base_revision) || !a?.world?.combat || !a?.progression || !entry)
    throw new Error('Expected a world rules export with a SolarSatellite catalog entry')
  for (const id of ['RoboticsFactory', 'Shipyard']) {
    if (!a.buildings?.[id] || !a.catalog.some((e) => e.key.kind === 'Building' && e.key.id === id && e.enabled))
      throw new Error(`Enable ${id} before preparing Solar Satellites`)
  }
  const item = { kind: 'Ship', id: 'SolarSatellite' }
  entry.enabled = true
  entry.mobile = false
  entry.body_kinds = ['Planet']
  entry.requirements = structuredClone(content.requirements)
  a.progression.solar_satellite = structuredClone(content.energy)
  const replace = (items, value, match) => {
    const index = items.findIndex(match)
    if (index < 0) items.push(value)
    else items[index] = value
  }
  const sameItem = (x) => x.item.kind === item.kind && x.item.id === item.id
  replace(a.progression.unit_costs, { item, cost: structuredClone(content.cost) }, sameItem)
  replace(a.world.combat.units, structuredClone(content.combat), sameItem)
  for (const id of Object.keys(content.rapid_fire_from)) addSatelliteRapidFire(a, id)
  return next
}

/** Add one newly defined ship's satellite relationship, in either activation order. */
export function addSatelliteRapidFire(artifact, id) {
  const factor = content.rapid_fire_from[id]
  if (!artifact.progression?.solar_satellite || !factor ||
      !artifact.world.combat.units.some((u) => u.item.kind === 'Ship' && u.item.id === id)) return
  const rule = { shooter: {kind:'Ship',id}, target: {kind:'Ship',id:'SolarSatellite'}, factor }
  const index = artifact.world.combat.rapid_fire.findIndex((x) =>
    x.shooter.kind === 'Ship' && x.shooter.id === id && x.target.kind === 'Ship' && x.target.id === 'SolarSatellite')
  if (index < 0) artifact.world.combat.rapid_fire.push(rule)
  else artifact.world.combat.rapid_fire[index] = rule
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4)
    throw new Error('Usage: node scripts/prepare-solar-satellite-rules.mjs rules-before.json rules-satellites.json')
  fs.writeFileSync(output, JSON.stringify(prepareSolarSatelliteRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', {flag:'wx', mode:0o600})
}
