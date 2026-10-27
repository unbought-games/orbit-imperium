import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { components } from '../../contracts'
import { TechnicalData } from './technical-data'
import { bonusPercent, technicalUnlocks } from './technical-data-model'
vi.mock('../../shell/session-context', () => ({
  useUniverseName: () => 'andromeda',
}))
type S = components['schemas']
const entry: S['CatalogEntry3'] = {
  key: { kind: 'Research', id: 'WeaponsTechnology' },
  enabled: true,
  mobile: false,
  body_kinds: ['Planet'],
  requirements: [],
}
const data: S['TechnicalData3'] = {
  facts: [],
  bonuses: [],
  combat: null,
  storage_capacities: null,
}
const body = {
  kind: 'Planet',
  levels: { MetalStorage: 2 },
} as unknown as S['BodyV3']
const view = {
  catalog: [],
  research: [{ research: 'WeaponsTechnology', level: 7 }],
} as unknown as S['BoundView4']
const render = (candidate: S['CatalogEntry3']) =>
  renderToStaticMarkup(
    createElement(TechnicalData, { entry: candidate, body, view }),
  )
describe('technical data', () => {
  it('formats exact additive bonuses without floating point or precision loss', () => {
    expect(bonusPercent(['1', '10'], 7)).toBe('70%')
    expect(bonusPercent(['3', '40'])).toBe('7.5%')
    expect(bonusPercent(['1', '3'])).toBe('100/3%')
    expect(bonusPercent(['9007199254740993', '100'])).toBe('9007199254740993%')
    expect(bonusPercent(['1', '0'])).toBe('Unavailable')
    expect(bonusPercent(['1', '10'], 0)).toBe('0%')
  })
  it('derives sorted unlocks from active catalog requirements, excluding disabled and other-body content', () => {
    const ship = (
      id: Extract<S['CatalogEntry3']['key'], { kind: 'Ship' }>['id'],
      level: number,
    ): S['CatalogEntry3'] => ({
      ...entry,
      key: { kind: 'Ship', id },
      requirements: [
        { type: 'PlayerResearch', research: 'WeaponsTechnology', level },
      ],
    })
    const entries: S['CatalogEntry3'][] = [
      ship('Cruiser', 5),
      ship('LightFighter', 2),
      { ...ship('Dreadnought', 12), enabled: false },
      { ...ship('SolarSatellite', 3), body_kinds: ['Moon'] as ['Moon'] },
      { ...entry, key: { kind: 'Research', id: 'EnergyTechnology' } },
    ]
    expect(
      technicalUnlocks(entry, entries, 'Planet').map((x) => [
        x.entry.key.id,
        x.level,
      ]),
    ).toEqual([
      ['LightFighter', 2],
      ['Cruiser', 5],
    ])
    const building: S['CatalogEntry3'] = {
      ...entry,
      key: { kind: 'Building' as const, id: 'ResearchLab' },
    }
    expect(
      technicalUnlocks(
        building,
        [
          {
            ...entry,
            requirements: [
              { type: 'BodyBuilding', building: 'ResearchLab', level: 4 },
            ],
          },
        ],
        'Planet',
      )[0].level,
    ).toBe(4)
  })
  it('renders a native collapsed disclosure with per-level and completed current bonuses', () => {
    const html = render({
      ...entry,
      technical_data: {
        ...data,
        bonuses: [
          {
            label: 'Attack',
            fraction: ['1', '10'],
            subject: null,
            condition: 'Applies to ships and defenses.',
          },
        ],
      },
    })
    expect(html).toContain('<summary>Technical data</summary>')
    expect(html).not.toContain(' open=')
    expect(html).toContain('+10% of base')
    expect(html).toContain('Level 7: +70% of base')
    expect(html).toContain('Applies to ships and defenses.')
  })
  it('does not invent data for older snapshots, disabled items or unknown future IDs', () => {
    expect(render(entry)).toContain('Technical data is unavailable')
    const disabled = render({
      ...entry,
      enabled: false,
      technical_data: {
        ...data,
        facts: [{ label: 'Hidden fact', value: '123', subject: null }],
      },
    })
    expect(disabled).toContain('Unavailable in this universe')
    expect(disabled).not.toContain('Hidden fact')
    expect(
      render({
        ...entry,
        key: {
          kind: 'Research',
          id: 'FutureResearch',
        } as unknown as S['CatalogEntry3']['key'],
      }),
    ).toContain('Technical data is unavailable')
  })
  it('selects current and next storage from server values with accessible resource names', () => {
    const html = render({
      ...entry,
      key: { kind: 'Building', id: 'MetalStorage' },
      technical_data: {
        ...data,
        storage_capacities: ['10000', '20000', '54321'],
      },
    })
    expect(html).toContain('Current capacity · level 2')
    expect(html).toContain('54,321')
    expect(html).toContain('Metal')
    expect(html).toContain('Unavailable for this level')
    expect(html).not.toContain('108,642')
  })
  it('distinguishes a known zero bonus from missing completed research', () => {
    const candidate = {
      ...entry,
      technical_data: {
        ...data,
        bonuses: [
          {
            label: 'Attack',
            fraction: ['1', '10'],
            subject: null,
            condition: null,
          },
        ],
      },
    }
    const html = renderToStaticMarkup(
      createElement(TechnicalData, {
        entry: candidate,
        body,
        view: {
          ...view,
          research: [{ research: 'WeaponsTechnology', level: 0 }],
        },
      }),
    )
    expect(html).toContain('+10% of base')
    expect(html).toContain('Level 0: +0% of base')
  })
  it('does not label missing completed levels as zero', () => {
    const html = render({
      ...entry,
      key: { kind: 'Research', id: 'ShieldingTechnology' },
      technical_data: {
        ...data,
        bonuses: [
          {
            label: 'Shield strength',
            fraction: ['1', '10'],
            subject: null,
            condition: null,
          },
        ],
      },
    })
    expect(html).toContain('+10% of base')
    expect(html).not.toContain('Level 0')
  })
  it('preserves fractional defense combat statistics and rapid-fire matchups', () => {
    const html = render({
      ...entry,
      key: { kind: 'Defense', id: 'RocketLauncher' },
      technical_data: {
        ...data,
        combat: {
          attack_ticks: '1000',
          shield_ticks: '2000000',
          hull_ticks: '20000000',
          rapid_fire_against: [],
          rapid_fire_from: [
            { unit: { kind: 'Ship', id: 'Cruiser' }, factor: '10' },
          ],
        },
      },
    })
    expect(html).toContain('Base values per defense')
    expect(html).toContain('0.01')
    expect(html).toContain('Cruiser')
    expect(html).toContain('10')
  })
})
