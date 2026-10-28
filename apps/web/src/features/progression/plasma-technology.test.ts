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

it('presents Plasma artwork and its turret unlock without per-level bonuses', () => {
  const details = catalogContent(plasma.key)
  expect(details.art.src).toBe('/art/atlas/objects/plasma-technology-640.webp')
  expect(details.description).toContain('Unlocks Plasma Turrets at level 7')
  expect(details.description).toContain('production or combat bonuses')
  expect(technicalUnlocks(plasma, [plasma], 'Planet')).toEqual([])
})

it('derives turret gates, unlocks and artwork from the enabled catalog', () => {
  const definition = JSON.parse(
    readFileSync('rules/content/plasma-turret.json', 'utf8'),
  )
  const turret: Entry = {
    key: { kind: 'Defense', id: 'PlasmaTurret' },
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
    requirements: definition.requirements,
  }
  const shipyard: Entry = {
    ...plasma,
    key: { kind: 'Building', id: 'Shipyard' },
  }
  expect(technicalUnlocks(plasma, [plasma, turret], 'Planet')).toEqual([
    { entry: turret, level: 7 },
  ])
  expect(technicalUnlocks(shipyard, [turret], 'Planet')).toEqual([
    { entry: turret, level: 8 },
  ])
  expect(
    technicalUnlocks(plasma, [{ ...turret, enabled: false }], 'Planet'),
  ).toEqual([])
  const details = catalogContent(turret.key)
  expect(details.art.src).toBe('/art/atlas/objects/plasma-turret-1200.webp')
  expect(details.description).toContain('Shipyard 8 and Plasma Technology 7')
})

it('derives Bomber unlocks and presents its propulsion upgrade', () => {
  const definition = JSON.parse(
    readFileSync('rules/content/bomber.json', 'utf8'),
  )
  const bomber: Entry = {
    key: { kind: 'Ship', id: 'Bomber' },
    enabled: true,
    mobile: true,
    body_kinds: ['Planet'],
    requirements: definition.requirements,
  }
  for (const [key, level] of [
    [{ kind: 'Research', id: 'PlasmaTechnology' }, 5],
    [{ kind: 'Research', id: 'ImpulseDrive' }, 6],
    [{ kind: 'Building', id: 'Shipyard' }, 8],
  ] as const) {
    expect(technicalUnlocks({ ...plasma, key }, [bomber], 'Planet')).toEqual([
      { entry: bomber, level },
    ])
    expect(
      technicalUnlocks(
        { ...plasma, key },
        [{ ...bomber, enabled: false }],
        'Planet',
      ),
    ).toEqual([])
  }
  const details = catalogContent(bomber.key)
  expect(details.art.src).toBe('/art/atlas/objects/bomber-1200.webp')
  expect(details.description).not.toMatch(
    /Requires|Shipyard 8|Plasma Technology 5/,
  )
  expect(details.description).toContain('Hyperspace Drive level 8 upgrade')
  expect(catalogContent(plasma.key).description).toContain('Bombers at level 5')
})
