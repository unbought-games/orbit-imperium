import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const content = JSON.parse(fs.readFileSync(new URL('../rules/content/ion-technology.json', import.meta.url)))

/** Add Ion Technology to an export with its prerequisite content already enabled. */
export function prepareIonRules(document) {
  const next = structuredClone(document)
  const artifact = next.artifact
  const entry = (kind, id) => artifact?.catalog?.find(e => e.key.kind === kind && e.key.id === id)
  if (!next.universe || !Number.isInteger(next.base_revision) || !artifact?.progression?.research || !Array.isArray(artifact.catalog)) {
    throw new Error('Expected a world rules export with an IonTechnology catalog entry')
  }
  const ion = entry('Research', 'IonTechnology')
  if (!ion) throw new Error('Expected a world rules export with an IonTechnology catalog entry')
  if (!artifact.buildings?.ResearchLab || !entry('Building', 'ResearchLab')?.enabled) {
    throw new Error('Enable ResearchLab before preparing Ion Technology')
  }
  for (const id of ['EnergyTechnology', 'LaserTechnology']) {
    if (!artifact.progression.research[id] || !entry('Research', id)?.enabled) {
      throw new Error(`Enable ${id} before preparing Ion Technology`)
    }
  }
  artifact.progression.research.IonTechnology = structuredClone(content.research)
  ion.enabled = true
  ion.requirements = structuredClone(content.requirements)
  return next
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/prepare-ion-rules.mjs rules-before.json rules-ion.json')
  fs.writeFileSync(output, JSON.stringify(prepareIonRules(JSON.parse(fs.readFileSync(input))), null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
