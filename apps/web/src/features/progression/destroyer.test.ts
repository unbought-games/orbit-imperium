import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { catalogContent } from './catalog-content'
import { technicalUnlocks } from './technical-data-model'

type Entry = components['schemas']['CatalogEntry3']
const definition = JSON.parse(
  readFileSync('rules/content/destroyer.json', 'utf8'),
)
const destroyer: Entry = {
  key: { kind: 'Ship', id: 'Destroyer' },
  enabled: true,
  mobile: true,
  body_kinds: ['Planet'],
  requirements: definition.requirements,
}

it('derives Destroyer unlocks from all three prerequisites and hides disabled content', () => {
  for (const [key, level] of [
    [{ kind: 'Building', id: 'Shipyard' }, 9],
    [{ kind: 'Research', id: 'HyperspaceDrive' }, 6],
    [{ kind: 'Research', id: 'HyperspaceTechnology' }, 5],
  ] as const) {
    expect(
      technicalUnlocks({ ...destroyer, key }, [destroyer], 'Planet'),
    ).toEqual([{ entry: destroyer, level }])
    expect(
      technicalUnlocks(
        { ...destroyer, key },
        [{ ...destroyer, enabled: false }],
        'Planet',
      ),
    ).toEqual([])
  }
})

it('uses the existing Destroyer art and describes its heavy combat role', () => {
  const content = catalogContent(destroyer.key)
  expect(content.art.src).toBe('/art/atlas/objects/destroyer-1200.webp')
  expect(content.description).toContain('heavily armoured warship')
  expect(content.description).toContain('hammer against stubborn defenses')
  expect(content.description).toContain('enemy battlecruisers')
})
