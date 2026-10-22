import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/impulse-drive.json', import.meta.url)))

/** Patch an exported universe document, preserving identity, revision and custom settings. */
export function prepareImpulseRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(e => e.key.kind === 'Research' && e.key.id === 'ImpulseDrive')
  if (!next.universe || !Number.isInteger(next.base_revision) || !artifact?.world || !artifact?.progression?.research || !artifact?.ships?.SmallCargo || !entry) {
    throw new Error('Expected a world rules export with an ImpulseDrive catalog entry')
  }
  artifact.progression.research.ImpulseDrive = structuredClone(content.research)
  entry.enabled = true
  entry.requirements = structuredClone(content.requirements)
  artifact.ships.SmallCargo.impulse_drive = structuredClone(content.small_cargo)
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-impulse-rules.mjs rules-before.json rules-impulse.json')
  fs.writeFileSync(output, JSON.stringify(prepareImpulseRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
