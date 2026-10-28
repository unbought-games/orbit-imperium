import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { catalogContent } from './catalog-content'
import { technicalUnlocks } from './technical-data-model'

type Entry = components['schemas']['CatalogEntry3']
const definition = JSON.parse(
  readFileSync('rules/content/hyperspace-technology.json', 'utf8'),
)
const hyperspace: Entry = {
  key: { kind: 'Research', id: 'HyperspaceTechnology' },
  enabled: true,
  mobile: false,
  body_kinds: ['Planet'],
  requirements: definition.requirements,
}

it('derives the technology unlock from each bundled prerequisite', () => {
  for (const [key, level] of [
    [{ kind: 'Building', id: 'ResearchLab' }, 7],
    [{ kind: 'Research', id: 'EnergyTechnology' }, 5],
    [{ kind: 'Research', id: 'ShieldingTechnology' }, 5],
  ] as const) {
    expect(
      technicalUnlocks({ ...hyperspace, key }, [hyperspace], 'Planet'),
    ).toEqual([{ entry: hyperspace, level }])
    expect(
      technicalUnlocks(
        { ...hyperspace, key },
        [{ ...hyperspace, enabled: false }],
        'Planet',
      ),
    ).toEqual([])
  }
})

it('uses existing artwork and explains the standard unlocks and lack of per-level bonuses', () => {
  const details = catalogContent(hyperspace.key)
  expect(details.art.src).toBe(
    '/art/atlas/objects/hyperspace-technology-640.webp',
  )
  expect(details.description).not.toMatch(
    /Research Lab|Energy Technology|Shielding Technology/,
  )
  expect(details.description).toContain(
    'no per-level cargo, speed, combat or production bonuses',
  )
  expect(details.description).toContain('Unlocks Hyperspace Drive at level 3')
  expect(details.description).toContain('Unlocks Destroyers at level 5')
  expect(technicalUnlocks(hyperspace, [hyperspace], 'Planet')).toEqual([])
})

it('derives the Hyperspace Drive unlock at Technology 3 only when enabled', () => {
  const drive: Entry = {
    ...hyperspace,
    key: { kind: 'Research', id: 'HyperspaceDrive' },
    requirements: JSON.parse(
      readFileSync('rules/content/hyperspace-drive.json', 'utf8'),
    ).requirements,
  }
  expect(technicalUnlocks(hyperspace, [hyperspace, drive], 'Planet')).toEqual([
    { entry: drive, level: 3 },
  ])
  expect(
    technicalUnlocks(
      hyperspace,
      [hyperspace, { ...drive, enabled: false }],
      'Planet',
    ),
  ).toEqual([])
  expect(catalogContent(drive.key).art.src).toBe(
    '/art/atlas/objects/hyperspace-drive-640.webp',
  )
})
