import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { catalogContent } from './catalog-content'
import { technicalUnlocks } from './technical-data-model'

type Entry = components['schemas']['CatalogEntry3']
const content = JSON.parse(
  readFileSync('rules/content/plasma-technology.json', 'utf8'),
)
const plasma: Entry = {
  key: { kind: 'Research', id: 'PlasmaTechnology' },
  enabled: true,
  mobile: false,
  body_kinds: ['Planet'],
  requirements: content.requirements,
}

it('derives Plasma unlocks for its prerequisite research from the bundled gates', () => {
  for (const [id, level] of [
    ['EnergyTechnology', 8],
    ['LaserTechnology', 10],
    ['IonTechnology', 5],
  ] as const) {
    const research: Entry = { ...plasma, key: { kind: 'Research', id } }
    expect(technicalUnlocks(research, [plasma], 'Planet')).toEqual([
      { entry: plasma, level },
    ])
    expect(
      technicalUnlocks(research, [{ ...plasma, enabled: false }], 'Planet'),
    ).toEqual([])
  }
})

it('presents Plasma artwork and explains its current lack of benefits', () => {
  const details = catalogContent(plasma.key)
  expect(details.art.src).toBe('/art/atlas/objects/plasma-technology-640.webp')
  expect(details.description).toContain('Currently provides no unlocks')
  expect(details.description).toContain('production and combat bonuses')
  expect(technicalUnlocks(plasma, [plasma], 'Planet')).toEqual([])
})
