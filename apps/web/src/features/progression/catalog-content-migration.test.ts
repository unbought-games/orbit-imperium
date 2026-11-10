import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { components } from '../../contracts'
import type { BoundProgressionOptions } from '../../client-model/commands'
import { readyFixture } from '../../test-support/bootstrap'
import { createGameStore } from '../../client-model/game-store'
import { noticeContent, orbAppearance } from '../command-hud/model'
import { availableDispatchShips } from '../../client-model/ship-selection'
import { validate } from '../../client-model/schema'
import { catalogContent } from './catalog-content'
import { ShipStatistics } from './ship-statistics'
import { TechnicalData } from './technical-data'
import { ProgressionBlockers } from './quote-review'
import { technicalUnlocks } from './technical-data-model'
import { comparisonStats } from './ship-comparison-model'
import { manufacturingPreview } from './manufacturing-preview'
import { progressionCommand } from './options'
import type { ProgressionProps } from './shared'

vi.mock('../../shell/session-context', () => ({
  useUniverseName: () => 'andromeda',
}))
type S = components['schemas']
type Ship = Extract<S['CatalogKey3'], { kind: 'Ship' }>['id']
type Definition = {
  requirements: S['Requirement3'][]
  cost: { metal: number; crystal: number; deuterium: number }
  ship: {
    drive?: S['ResearchId3']
    base_speed: number
    drive_coefficient: number[]
    fuel: number
    capacity: number
  }
  combat: {
    attack_hundredths: number
    shield_hundredths: number
    cost: number[]
  }
  rapid_fire: { target: S['ItemKey3']; factor: number }[]
}
const read = (slug: string): Definition =>
  JSON.parse(readFileSync(`rules/content/${slug}.json`, 'utf8'))
// Fixed examples, independent of the rules used to prepare the subject. These
// protect the exact costs/statistics formerly asserted through fixture browsers.
const ships = [
  {
    id: 'HeavyFighter',
    slug: 'heavy-fighter',
    drive: 'ImpulseDrive',
    level: 2,
    speed: '14000',
    base: '10000',
    cargo: '100',
    fuel: '75',
    hull: '100000000',
    attack: '15000000',
    shield: '2500000',
    cost: ['6000', '4000', '0'],
    paid: ['12000000000', '8000000000', '0'],
    prose: 'An impulse-powered combat ship',
    art: 1200,
    requirements: [
      ['Shipyard', 3],
      ['ArmourTechnology', 2],
      ['ImpulseDrive', 2],
    ],
  },
  {
    id: 'Cruiser',
    slug: 'cruiser',
    drive: 'ImpulseDrive',
    level: 4,
    speed: '27000',
    base: '15000',
    cargo: '800',
    fuel: '300',
    hull: '270000000',
    attack: '40000000',
    shield: '5000000',
    cost: ['20000', '7000', '2000'],
    paid: ['40000000000', '14000000000', '4000000000'],
    prose: 'A fast impulse-powered combat ship',
    art: 1200,
    requirements: [
      ['Shipyard', 5],
      ['IonTechnology', 2],
      ['ImpulseDrive', 4],
    ],
  },
  {
    id: 'LargeCargo',
    slug: 'large-cargo',
    drive: 'CombustionDrive',
    level: 6,
    speed: '12000',
    base: '7500',
    cargo: '25000',
    fuel: '50',
    hull: '120000000',
    attack: '500000',
    shield: '2500000',
    cost: ['6000', '6000', '0'],
    paid: ['12000000000', '12000000000', '0'],
    prose: 'A bulk transport',
    art: 1200,
    requirements: [
      ['Shipyard', 4],
      ['CombustionDrive', 6],
    ],
  },
  {
    id: 'Battleship',
    slug: 'battleship',
    drive: 'HyperspaceDrive',
    level: 4,
    speed: '22000',
    base: '10000',
    cargo: '1500',
    fuel: '500',
    hull: '600000000',
    attack: '100000000',
    shield: '20000000',
    cost: ['45000', '15000', '0'],
    paid: ['90000000000', '30000000000', '0'],
    prose: 'A hyperspace-powered warship',
    art: 1200,
    requirements: [
      ['Shipyard', 7],
      ['HyperspaceDrive', 4],
    ],
  },
  {
    id: 'Battlecruiser',
    slug: 'battlecruiser',
    drive: 'HyperspaceDrive',
    level: 5,
    speed: '25000',
    base: '10000',
    cargo: '750',
    fuel: '250',
    hull: '700000000',
    attack: '70000000',
    shield: '40000000',
    cost: ['30000', '40000', '15000'],
    paid: ['60000000000', '80000000000', '30000000000'],
    prose: 'A hyperspace-powered combat ship',
    art: 1200,
    requirements: [
      ['Shipyard', 8],
      ['LaserTechnology', 12],
      ['HyperspaceTechnology', 5],
      ['HyperspaceDrive', 5],
    ],
  },
  {
    id: 'Bomber',
    slug: 'bomber',
    drive: 'ImpulseDrive',
    level: 6,
    speed: '8800',
    base: '4000',
    cargo: '500',
    fuel: '1000',
    hull: '750000000',
    attack: '100000000',
    shield: '50000000',
    cost: ['50000', '25000', '15000'],
    paid: ['100000000000', '50000000000', '30000000000'],
    prose: 'An impulse-powered siege ship',
    art: 1200,
    requirements: [
      ['Shipyard', 8],
      ['PlasmaTechnology', 5],
      ['ImpulseDrive', 6],
    ],
  },
  {
    id: 'Destroyer',
    slug: 'destroyer',
    drive: 'HyperspaceDrive',
    level: 6,
    speed: '14000',
    base: '5000',
    cargo: '2000',
    fuel: '1000',
    hull: '1100000000',
    attack: '200000000',
    shield: '50000000',
    cost: ['60000', '50000', '15000'],
    paid: ['120000000000', '100000000000', '30000000000'],
    prose: 'A heavy combat ship powered by Hyperspace Drive',
    art: 1200,
    requirements: [
      ['Shipyard', 9],
      ['HyperspaceTechnology', 5],
      ['HyperspaceDrive', 6],
    ],
  },
] as const

function entryFor(example: (typeof ships)[number]): S['CatalogEntry3'] {
  const d = read(example.slug)
  return {
    key: { kind: 'Ship', id: example.id },
    enabled: true,
    mobile: true,
    body_kinds: ['Planet'],
    requirements: d.requirements,
    ship_statistics: {
      cost: [d.cost.metal, d.cost.crystal, d.cost.deuterium].map(String),
      propulsion: {
        drive: d.ship.drive ?? 'CombustionDrive',
        drive_coefficient: d.ship.drive_coefficient.map(String),
        base_speed: String(d.ship.base_speed),
        cargo_capacity: String(d.ship.capacity),
        fuel_consumption: String(d.ship.fuel),
        impulse_upgrade: null,
      },
      combat: {
        technology_bonus: ['1', '10'],
        attack_ticks: String(d.combat.attack_hundredths * 1000),
        shield_ticks: String(d.combat.shield_hundredths * 1000),
        hull_ticks: String((d.cost.metal + d.cost.crystal) * 10000),
        rapid_fire_against: d.rapid_fire.map((r) => ({
          unit: r.target,
          factor: String(r.factor),
        })),
        rapid_fire_from: [],
      },
    },
  }
}
const view = readyFixture(4).snapshot.view as ProgressionProps['view']
const planet: ProgressionProps['body'] = {
  id: 'planet',
  kind: 'Planet',
  coordinates: { galaxy: 1, system: 1, position: 1 },
  amounts: {
    metal: '1000000000000',
    crystal: '1000000000000',
    deuterium: '1000000000000',
  },
  capacity: {
    metal: '1000000000000',
    crystal: '1000000000000',
    deuterium: '1000000000000',
  },
  levels: {},
  fields: 163,
  fields_used: 0,
  fields_reserved: 0,
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  inventories: [],
}
function quote(entry: S['CatalogEntry3']): BoundProgressionOptions {
  const item = entry.key as { kind: 'Ship'; id: Ship }
  const [metal, crystal, deuterium] = entry.ship_statistics!.cost!.map(
    (value) => String(BigInt(value) * 1000000n),
  )
  const paid = { metal, crystal, deuterium }
  return {
    protocol: 4,
    binding: view.binding,
    request_id: 'quote',
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
    request: { type: 'Manufacture', body: planet.id, item, quantity: '1' },
    terms_hash: 'b'.repeat(64),
    estimates: null,
    blockers: [],
    terms: {
      type: 'Manufacture',
      body: planet.id,
      item,
      quantity: '1',
      profile_hash: view.profile_hash,
      paid,
      unit_cost: paid,
      unit_duration_ms: 1000,
      formula: 'ManufactureClassic',
      facilities: [],
    },
  }
}

describe.each(ships)('$id catalog contract', (example) => {
  const entry = entryFor(example)
  it('retains each prerequisite, its exact level and its visible blocker', () => {
    expect(
      entry.requirements.map((r) => [
        r.type === 'BodyBuilding' ? r.building : r.research,
        r.level,
      ]),
    ).toEqual(example.requirements)
    for (const requirement of entry.requirements) {
      const key: S['CatalogKey3'] =
        requirement.type === 'BodyBuilding'
          ? { kind: 'Building', id: requirement.building }
          : { kind: 'Research', id: requirement.research }
      expect(technicalUnlocks({ ...entry, key }, [entry], 'Planet')).toEqual([
        { entry, level: requirement.level },
      ])
      expect(
        technicalUnlocks(
          { ...entry, key },
          [{ ...entry, enabled: false }],
          'Planet',
        ),
      ).toEqual([])
      const blocker: BoundProgressionOptions['blockers'][number] = {
        code: 'PrerequisiteMissing',
        requirement,
        required: String(requirement.level),
        actual: String(requirement.level - 1),
        resource: null,
        unit: 'Level',
      }
      const html = renderToStaticMarkup(
        createElement(ProgressionBlockers, {
          proposal: { blockers: [blocker] },
        }),
      )
      expect(html).toContain('aria-label="Action blockers"')
      expect(html).toContain(key.id.replace(/([a-z])([A-Z])/g, '$1 $2'))
      expect(html).toContain(
        `requires ${requirement.level}; current ${requirement.level - 1}`,
      )
      expect(
        manufacturingPreview(
          { ...quote(entry), blockers: [blocker] },
          { ...view, bodies: [planet] },
          '2',
        )!.blockers,
      ).toEqual([blocker])
    }
  })
  it('renders universe unavailability without leaking technical statistics', () => {
    const disabled = { ...entry, enabled: false }
    const html = renderToStaticMarkup(
      createElement(TechnicalData, { entry: disabled, view, body: planet }),
    )
    expect(html).toContain('Unavailable in this universe.')
    expect(html).not.toContain('Ship technical statistics')
    expect(comparisonStats(disabled, [], 'base').speed).toBeUndefined()
  })
  it('keeps descriptive content and decodable canonical artwork', async () => {
    const content = catalogContent(entry.key)
    expect(content.description).toContain(example.prose)
    expect(content.art.src).toBe(
      `/art/atlas/objects/${example.slug}-${example.art}.webp`,
    )
    const decoded = await sharp(`apps/web/public${content.art.src}`)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(decoded.info.width).toBe(1200)
    expect(decoded.info.height).toBe(1200)
  })
  it('renders base statistics and applies completed drive levels', () => {
    expect(comparisonStats(entry, [], 'base')).toMatchObject({
      cost: example.cost,
      drive: example.drive,
      speed: example.base,
      cargo: example.cargo,
      fuel: example.fuel,
      attack: example.attack,
      shield: example.shield,
      hull: example.hull,
    })
    expect(
      comparisonStats(
        entry,
        [{ research: example.drive, level: example.level }],
        'current',
      ).speed,
    ).toBe(example.speed)
    const html = renderToStaticMarkup(createElement(ShipStatistics, { entry }))
    expect(html).toContain('Ship technical statistics')
    expect(html).toContain(example.drive.replace(/([a-z])([A-Z])/g, '$1 $2'))
    const text = html.replace(/<[^>]*>/g, '')
    for (const [label, value] of [
      ['Cargo capacity', example.cargo],
      ['Base speed', example.base],
      ['Base fuel consumption', example.fuel],
      ['Attack strength', String(Number(example.attack) / 100000)],
      ['Shield strength', String(Number(example.shield) / 100000)],
      ['Hull strength', String(Number(example.hull) / 100000)],
    ])
      expect(text).toContain(`${label}${Number(value).toLocaleString('en-US')}`)
    expect(html).not.toContain('profile changes')
    expect(html).toContain(
      'Cargo capacity is shared by resources and mission fuel.',
    )
  })
  it('quotes two units at exact resource costs and keeps the selected item in the command', () => {
    const source = quote(entry)
    const preview = manufacturingPreview(
      source,
      { ...view, bodies: [planet] },
      '2',
    )!
    expect(preview.terms.paid).toEqual({
      metal: example.paid[0],
      crystal: example.paid[1],
      deuterium: example.paid[2],
    })
    expect(preview.blockers).toEqual([])
    expect(
      progressionCommand({
        ...source,
        request: preview.request,
        terms: preview.terms,
      }),
    ).toEqual({
      type: 'StartManufacture',
      body: 'planet',
      item: { kind: 'Ship', id: example.id },
      quantity: '2',
      expected_terms_hash: 'b'.repeat(64),
    })
  })
  it('keeps its exact inventory and accepts its selected fleet composition', () => {
    expect(
      availableDispatchShips(
        [example.id],
        [{ item: { kind: 'Ship', id: example.id }, count: '2' }],
      ),
    ).toEqual({ [example.id]: '2' })
    expect(() =>
      validate('FleetIntent4', {
        origin: view.binding.player,
        destination: {
          type: 'Body',
          id: view.binding.account,
          expected_kind: 'Planet',
          expected_owner: view.binding.player,
        },
        mission: example.id === 'LargeCargo' ? 'Transport' : 'Attack',
        ships: [
          { owner: view.binding.player, ship_type: example.id, count: '2' },
        ],
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      }),
    ).not.toThrow()
  })
})

it('renders the distinct siege and native hyperspace rapid-fire profiles', () => {
  const expected = {
    Bomber: ['Solar Satellite', 'Light Laser'],
    Destroyer: ['Solar Satellite', 'Light Laser'],
    Battleship: ['Solar Satellite'],
    Battlecruiser: ['Solar Satellite', 'Cruiser', 'Battleship'],
  }
  for (const example of ships) {
    if (!(example.id in expected)) continue
    const html = renderToStaticMarkup(
      createElement(ShipStatistics, { entry: entryFor(example) }),
    )
    for (const name of expected[example.id as keyof typeof expected])
      expect(html).toContain(name)
    if (example.id === 'Battleship') expect(html).not.toContain('Light Laser')
    if (example.id === 'Battlecruiser') expect(html).toContain('Battleship × 7')
  }
})

it.each([
  ['HyperspaceDrive', 'hyperspace-drive'],
  ['HyperspaceTechnology', 'hyperspace-technology'],
] as const)('%s hides disabled technical content and unlocks', (id, slug) => {
  const entry: S['CatalogEntry3'] = {
    key: { kind: 'Research', id },
    enabled: false,
    mobile: false,
    body_kinds: ['Planet'],
    requirements: read(slug).requirements,
  }
  const html = renderToStaticMarkup(
    createElement(TechnicalData, { entry, view, body: planet }),
  )
  expect(html).toContain('Unavailable in this universe.')
  expect(html).not.toContain('Prerequisites')
  expect(
    technicalUnlocks(
      { ...entry, key: { kind: 'Building', id: 'ResearchLab' } },
      [entry],
      'Planet',
    ),
  ).toEqual([])
})

it('Heavy Fighter acceptance retains the quoted costs and green HUD result', () => {
  const entry = entryFor(ships[0])
  const source = quote(entry)
  const preview = manufacturingPreview(
    source,
    { ...view, bodies: [planet] },
    '2',
  )!
  const acceptedQuote = {
    ...source,
    request: preview.request,
    terms: preview.terms,
  }
  const command = progressionCommand(acceptedQuote)!
  const state = {
    ...createGameStore().getState(),
    view,
    binding: view.binding,
    ready: true,
  }
  state.attempts.set('heavy-order', {
    envelope: {
      protocol: 4,
      binding: view.binding,
      command_id: 'heavy-order',
      presence: null,
      command,
    },
    status: 'committed',
    receipt: null,
    reconciled: false,
  })
  state.intents.set('heavy-order', {
    submittedAt: 1000,
    baseRevision: '1',
    quote: acceptedQuote,
  })
  expect(
    noticeContent(state, { kind: 'command', id: 'heavy-order' }),
  ).toMatchObject({
    title: 'Shipyard order accepted',
    detail: '2 Heavy Fighter · 1s each',
    tone: 'green',
    costs: { metal: '12000000000', crystal: '8000000000', deuterium: '0' },
  })
  expect(
    orbAppearance(state, [
      { kind: 'command', id: 'heavy-order', shownAt: 1000 },
    ]),
  ).toEqual({ tone: 'green', icon: 'shipyard' })
})
