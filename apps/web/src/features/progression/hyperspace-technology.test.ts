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

it('uses existing artwork and explains the current lack of dependent systems and bonuses', () => {
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
  expect(details.description).toContain(
    'Hyperspace Drive and other dependent systems are unavailable',
  )
  expect(details.description).toContain(
    'higher levels currently provide no additional benefit',
  )
  expect(technicalUnlocks(hyperspace, [hyperspace], 'Planet')).toEqual([])
})
