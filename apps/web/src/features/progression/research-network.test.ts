import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { catalogContent } from './catalog-content'
import { technicalUnlocks } from './technical-data-model'

const entry: components['schemas']['CatalogEntry3'] = {
  key: { kind: 'Research', id: 'IntergalacticResearchNetwork' },
  enabled: true,
  mobile: false,
  body_kinds: ['Planet'],
  requirements: JSON.parse(
    readFileSync('rules/content/intergalactic-research-network.json', 'utf8'),
  ).requirements,
}
it('exposes the network through its actual prerequisites and keeps disabled content out of unlocks', () => {
  for (const [key, level] of [
    [{ kind: 'Building', id: 'ResearchLab' }, 10],
    [{ kind: 'Research', id: 'ComputerTechnology' }, 8],
    [{ kind: 'Research', id: 'HyperspaceTechnology' }, 8],
  ] as const) {
    expect(technicalUnlocks({ ...entry, key }, [entry], 'Planet')).toEqual([
      { entry, level },
    ])
    expect(
      technicalUnlocks(
        { ...entry, key },
        [{ ...entry, enabled: false }],
        'Planet',
      ),
    ).toEqual([])
  }
  expect(catalogContent(entry.key).art.src).toBe(
    '/art/atlas/objects/intergalactic-research-network-640.webp',
  )
})
