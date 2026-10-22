import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/astrophysics.json', import.meta.url)))

/** Apply Astrophysics to an exported universe, preserving all unrelated rules. */
export function prepareAstrophysicsRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = artifact?.catalog?.find(e => e.key.kind === 'Research' && e.key.id === 'Astrophysics')
  if (!next.universe || !Number.isInteger(next.base_revision) || !artifact?.world || !artifact?.progression?.research || !entry) {
    throw new Error('Expected a world rules export with an Astrophysics catalog entry')
  }
  for (const id of ['EspionageTechnology', 'ImpulseDrive']) {
    if (!artifact.progression.research[id] || !artifact.catalog.some(e => e.key.kind === 'Research' && e.key.id === id && e.enabled)) {
      throw new Error(`Enable ${id} before preparing Astrophysics`)
    }
  }
  artifact.progression.research.Astrophysics = structuredClone(content.research)
  entry.enabled = true
  entry.requirements = structuredClone(content.requirements)
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-astrophysics-rules.mjs rules-before.json rules-astrophysics.json')
  fs.writeFileSync(output, JSON.stringify(prepareAstrophysicsRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
