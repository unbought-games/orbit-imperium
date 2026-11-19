import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import type { components } from '../../contracts'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { Coordinator } from '../../client-model/coordinator'
import { createGameStore } from '../../client-model/game-store'
import { TechnologyDetails } from './technology-details'
import { BuildingDetails } from './building-details'
import { TechnologyTree } from './technology-tree'
import { progressionFixture } from './progression-test-fixture'
import { manufacturingPreview } from './manufacturing-preview'
import { catalogContent } from './catalog-content'
import { progressionCommand } from './options'
import { createManufacturingOrder } from './manufacturing-order'

vi.mock('../../shell/session-context', () => ({
  useUniverseName: () => 'andromeda',
}))
type S = components['schemas']
const examples = [
  {
    id: 'LightLaser',
    art: 'light-laser',
    prose: 'A compact laser emplacement',
    rules: 'mvp-v1-slice-8',
    levels: { Shipyard: 2 },
    research: { EnergyTechnology: 1, LaserTechnology: 3 },
    cost: ['1500000000', '500000000', '0'],
    total: ['4500000000', '1500000000', '0'],
  },
  {
    id: 'IonCannon',
    art: 'ion-cannon',
    prose: 'A resilient weapon emplacement',
    rules: 'mvp-v1-slice-10',
    levels: { Shipyard: 4 },
    research: { IonTechnology: 4 },
    cost: ['2000000000', '6000000000', '0'],
    total: ['6000000000', '18000000000', '0'],
  },
  {
    id: 'GaussCannon',
    art: 'gauss-cannon',
    prose: 'An electromagnetic cannon',
    rules: 'mvp-v1-slice-12',
    levels: { Shipyard: 6 },
    research: {
      EnergyTechnology: 6,
      WeaponsTechnology: 3,
      ShieldingTechnology: 1,
    },
    cost: ['20000000000', '15000000000', '2000000000'],
    total: ['60000000000', '45000000000', '6000000000'],
  },
  {
    id: 'HeavyLaser',
    art: 'heavy-laser',
    prose: 'A powerful laser battery',
    rules: 'mvp-v1-heavy-laser',
    levels: { Shipyard: 4 },
    research: { EnergyTechnology: 3, LaserTechnology: 6 },
    cost: ['6000000000', '2000000000', '0'],
    total: ['18000000000', '6000000000', '0'],
  },
  {
    id: 'PlasmaTurret',
    art: 'plasma-turret',
    prose: 'A towering weapon',
    rules: 'mvp-v1-slice-12',
    levels: { Shipyard: 8 },
    research: { PlasmaTechnology: 7 },
    cost: ['50000000000', '50000000000', '30000000000'],
    total: ['150000000000', '150000000000', '90000000000'],
  },
] as const

for (const example of examples) {
  // Same published content used by the original application scenarios.
  const catalog = (
    JSON.parse(
      readFileSync(
        new URL(`../../../../../rules/${example.rules}.json`, import.meta.url),
        'utf8',
      ),
    ) as { catalog: S['CatalogEntry3'][] }
  ).catalog
  it(`${example.id} publishes its field notes and decodable responsive artwork`, async () => {
    const { art, description } = catalogContent({
      kind: 'Defense',
      id: example.id,
    })
    expect(description).toContain(example.prose)
    for (const width of [96, 320, 640, 1200]) {
      const url = `/art/atlas/objects/${example.art}-${width}.webp`
      expect(art.srcSet).toContain(`${url} ${width}w`)
      const decoded = await sharp(`apps/web/public${url}`)
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(decoded.info.width).toBe(width)
      expect(decoded.info.height).toBe(width)
    }
  })
  for (const gate of [
    'ready',
    'disabled',
    ...Object.keys(example.levels),
    ...Object.keys(example.research),
  ]) {
    it(`${example.id} renders ${gate} eligibility and preserves authoritative batch terms`, async () => {
      const { view, source } = progressionFixture()
      const body = view.bodies[0]
      const entry = structuredClone(
        catalog.find((e) => e.key.id === example.id)!,
      )
      expect(entry).toBeDefined()
      if (example.id === 'PlasmaTurret') {
        entry.enabled = true
        entry.requirements = JSON.parse(
          readFileSync(
            new URL(
              '../../../../../rules/content/plasma-turret.json',
              import.meta.url,
            ),
            'utf8',
          ),
        ).requirements
      }
      view.catalog = catalog.map((item) =>
        item.key.id === entry.key.id ? entry : item,
      )
      body.levels.Shipyard =
        example.levels.Shipyard - Number(gate === 'Shipyard')
      view.research = Object.entries(example.research).map(
        ([research, level]) => ({
          research: research as S['ResearchId3'],
          level: level - Number(gate === research),
        }),
      )
      body.amounts = {
        metal: '1000000000000',
        crystal: '1000000000000',
        deuterium: '1000000000000',
      }
      body.inventories = [
        { item: entry.key as S['ManufacturingBatchDto']['item'], count: '7' },
      ]
      if (source.terms?.type !== 'Manufacture') throw Error('fixture')
      const paid = {
        metal: example.cost[0],
        crystal: example.cost[1],
        deuterium: example.cost[2],
      }
      const item = { kind: 'Defense', id: example.id } as const
      source.request = {
        type: 'Manufacture',
        body: body.id,
        item,
        quantity: '1',
      }
      source.terms = { ...source.terms, item, unit_cost: paid, paid }
      if (gate === 'disabled') entry.enabled = false
      if (gate !== 'ready')
        source.blockers = [
          {
            code:
              gate === 'disabled'
                ? 'UnavailableContent'
                : 'PrerequisiteMissing',
            requirement: null,
            required: null,
            actual: null,
            resource: null,
            unit: null,
          },
        ]
      const store = createGameStore()
      store.setState({ view, binding: view.binding, ready: true })
      const model = {
        store,
        ready: true,
        stale: false,
        options: vi.fn(async () => source),
        send: vi.fn(async () => undefined),
      }
      const routeTree = createRootRoute({
        component: () =>
          createElement(
            Fragment,
            null,
            createElement(TechnologyDetails, {
              coordinator: model as unknown as Coordinator,
              view,
              body,
              page: 'defense',
              selection: {
                selectedId: example.id,
                close: vi.fn(),
                back: {
                  href: '/defense',
                  'aria-label': 'Back to Defense',
                  onClick: vi.fn(),
                },
                link: () => ({
                  href: '/defense',
                  'data-catalog-item': example.id,
                  onClick: vi.fn(),
                }),
              },
              entry,
              count: '7',
              proposal: source,
              loading: false,
              error: '',
              quantity: '3',
              onQuantity: vi.fn(),
              onInspect: vi.fn(),
              onTechnology: vi.fn(),
            }),
            createElement(TechnologyTree, {
              entry,
              view,
              body,
              onNavigate: vi.fn(),
            }),
          ),
      })
      const router = createRouter({ routeTree, history: createMemoryHistory() })
      await router.load()
      const html = renderToStaticMarkup(
        createElement(RouterProvider, { router }),
      )
      const build = html.match(/<button[^>]*aria-label="Build"[^>]*>/)?.[0]
      const max = html.match(
        /<button[^>]*aria-label="Max [^"]+ quantity"[^>]*>/,
      )?.[0]
      expect(max).toBeDefined()
      expect(max!.includes('disabled')).toBe(gate !== 'ready')
      expect(build).toBeDefined()
      if (gate === 'ready') expect(build).not.toContain('disabled')
      else expect(build).toContain('disabled')
      if (gate === 'disabled')
        expect(html).toContain('Unavailable in this universe.')
      else if (gate !== 'ready') {
        const required =
          gate === 'Shipyard'
            ? example.levels.Shipyard
            : example.research[gate as keyof typeof example.research]
        expect(html).toContain(`current ${required - 1} · required`)
        expect(html).toContain(`${required - 1} / ${required} · Required`)
      }
      expect(html).toContain('Stationed</span><strong>7</strong>')
      expect(html).toContain('Technology tree')
      const preview = manufacturingPreview(source, view, '3')!
      expect(preview.terms.paid).toEqual({
        metal: example.total[0],
        crystal: example.total[1],
        deuterium: example.total[2],
      })
      if (gate === 'ready') {
        expect(entry.requirements).toHaveLength(
          Object.keys(example.levels).length +
            Object.keys(example.research).length,
        )
        for (const level of [
          example.levels.Shipyard,
          ...Object.values(example.research),
        ])
          expect(html).toContain(`${level} / ${level} · Met`)
        expect(html).toContain('Technology tree')
        expect(
          progressionCommand({
            ...source,
            request: preview.request,
            terms: preview.terms,
          }),
        ).toEqual({
          type: 'StartManufacture',
          body: body.id,
          item,
          quantity: '3',
          expected_terms_hash: 'b'.repeat(64),
        })
      }
      if (gate !== 'ready') {
        await createManufacturingOrder(model).build(
          preview,
          view.binding,
          'draft',
          vi.fn(),
        )
        expect(model.options).not.toHaveBeenCalled()
        expect(model.send).not.toHaveBeenCalled()
      }
    })
  }
}

for (const example of [
  {
    id: 'ImpulseDrive',
    definition: 'impulse-drive',
    source: 3,
    lab: 2,
    gates: { EnergyTechnology: 1 },
    paid: ['16000000000', '32000000000', '4800000000'],
    duration: 11520000,
    formula: 'ResearchClassic',
    notes: ['Powerful propulsion', 'worlds waiting beyond familiar space'],
  },
  {
    id: 'Astrophysics',
    definition: 'astrophysics',
    source: 4,
    lab: 3,
    gates: { EspionageTechnology: 4, ImpulseDrive: 3 },
    paid: ['37500000000', '75000000000', '37500000000'],
    duration: 20250000,
    formula: 'ResearchAstrophysics',
    notes: [
      'The study of distant worlds',
      'bringing unfamiliar orbits and new homes within reach.',
    ],
  },
  {
    id: 'HyperspaceDrive',
    definition: 'hyperspace-drive',
    source: 0,
    lab: 7,
    gates: { HyperspaceTechnology: 3 },
    paid: ['10000000000', '20000000000', '6000000000'],
    duration: 2700000,
    formula: 'ResearchClassic',
    notes: ['An engine that reaches beyond ordinary space'],
  },
  {
    id: 'HyperspaceTechnology',
    definition: 'hyperspace-technology',
    source: 0,
    lab: 7,
    gates: { EnergyTechnology: 5, ShieldingTechnology: 5 },
    paid: ['0', '4000000000', '2000000000'],
    duration: 360000,
    formula: 'ResearchClassic',
    notes: ['foundations for advanced propulsion'],
  },
  {
    id: 'IonTechnology',
    definition: 'ion-technology',
    source: 0,
    lab: 4,
    gates: { EnergyTechnology: 4, LaserTechnology: 5 },
    paid: ['1000000000', '300000000', '100000000'],
    duration: 187000,
    formula: 'ResearchClassic',
    notes: [
      'The science of charged particles harnessed for war.',
      'from formidable planetary cannons to the weapons carried into battle by cruisers',
    ],
  },
  {
    id: 'GravitonTechnology',
    definition: 'graviton-technology',
    source: 0,
    lab: 12,
    gates: {},
    paid: ['0', '0', '0'],
    duration: 1000,
    formula: 'ResearchClassic',
    notes: [
      'Gross energy required to start',
      'This planet’s gross production',
      'No materials',
      '>300,000<',
    ],
  },
  {
    id: 'LaserTechnology',
    definition: 'light-laser',
    source: 0,
    lab: 1,
    gates: { EnergyTechnology: 2 },
    paid: ['200000000', '100000000', '0'],
    duration: 60000,
    formula: 'ResearchClassic',
    notes: ['The mastery of light concentrated into a weapon.'],
  },
] as const) {
  it(`${example.id} displays its bound next level, prerequisite progress and exact research costs`, async () => {
    const { view, source } = progressionFixture()
    const body = view.bodies[0]
    const content = JSON.parse(
      readFileSync(`rules/content/${example.definition}.json`, 'utf8'),
    )
    const entry: S['CatalogEntry3'] = {
      key: { kind: 'Research', id: example.id },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: content.requirements ?? content.research.requirements,
    }
    const gates = Object.entries(example.gates) as [S['ResearchId3'], number][]
    expect(entry.requirements).toEqual([
      { type: 'BodyBuilding', building: 'ResearchLab', level: example.lab },
      ...gates.map(([research, level]) => ({
        type: 'PlayerResearch',
        research,
        level,
      })),
    ])
    body.levels.ResearchLab = example.lab
    body.amounts = {
      metal: '100000000000',
      crystal: '100000000000',
      deuterium: '100000000000',
    }
    view.research = [
      { research: example.id, level: example.source },
      ...gates.map(([research, level]) => ({ research, level })),
    ]
    view.catalog = [entry]
    const request = {
      type: 'Research',
      host: body.id,
      research: example.id,
    } as const
    const [metal, crystal, deuterium] = example.paid
    const proposal: BoundProgressionOptions = {
      ...source,
      request,
      terms: {
        ...request,
        profile_hash: view.profile_hash,
        source_level: example.source,
        target_level: example.source + 1,
        paid: { metal, crystal, deuterium },
        duration_ms: example.duration,
        formula: example.formula,
        labs: [{ body: body.id, level: example.lab }],
        effective_lab: String(example.lab),
        required_energy:
          example.id === 'GravitonTechnology' ? '300000000000' : '0',
      },
    }
    const store = createGameStore()
    store.setState({ view, binding: view.binding, ready: true })
    const routeTree = createRootRoute({
      component: () =>
        createElement(
          Fragment,
          null,
          createElement(TechnologyDetails, {
            coordinator: { store, ready: true } as unknown as Coordinator,
            view,
            body,
            page: 'research',
            selection: {
              selectedId: example.id,
              close: vi.fn(),
              back: {
                href: '/research',
                'aria-label': 'Back to Research',
                onClick: vi.fn(),
              },
              link: () => ({
                href: '/research',
                'data-catalog-item': example.id,
                onClick: vi.fn(),
              }),
            },
            entry,
            count: example.source,
            proposal,
            loading: false,
            error: '',
            quantity: '1',
            onQuantity: vi.fn(),
            onInspect: vi.fn(),
            onTechnology: vi.fn(),
          }),
          createElement(TechnologyTree, {
            entry,
            view,
            body,
            onNavigate: vi.fn(),
          }),
        ),
    })
    const router = createRouter({ routeTree, history: createMemoryHistory() })
    await router.load()
    const html = renderToStaticMarkup(createElement(RouterProvider, { router }))
    expect(html).toContain(`Next · level ${example.source + 1}`)
    for (const amount of example.paid) {
      if (amount === '0') continue
      expect(html).toContain(
        `>${(BigInt(amount) / 1000000n).toLocaleString('en-US')}<`,
      )
    }
    for (const level of [example.lab, ...gates.map(([, level]) => level)])
      expect(html).toContain(`${level} / ${level} · Met`)
    for (const note of example.notes) expect(html).toContain(note)
    const art = catalogContent(entry.key).art
    expect(html).toContain(art.src)
    const bitmap = await sharp(`apps/web/public${art.src}`)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(bitmap.info.width).toBe(640)
    expect(bitmap.info.height).toBe(640)
    expect(progressionCommand(proposal)).toEqual({
      type: 'StartResearch',
      host: body.id,
      research: example.id,
      expected_terms_hash: 'b'.repeat(64),
    })
    // A delivered refusal can contain several missing requirements. Inspect
    // what the real confirmation and blockers render for that receipt.
    proposal.blockers = entry.requirements.map((requirement) => ({
      code: 'PrerequisiteMissing',
      requirement,
      required: String(requirement.level),
      actual: String(requirement.level - 1),
      unit: 'Level',
      resource: null,
    }))
    const blocked = renderToStaticMarkup(
      createElement(RouterProvider, { router }),
    )
    expect(
      blocked.match(/<button[^>]*aria-label="Confirm research"[^>]*>/)?.[0],
    ).toContain('disabled')
    for (const r of entry.requirements) {
      const subject = r.type === 'BodyBuilding' ? r.building : r.research
      expect(blocked).toContain(subject.replace(/([a-z])([A-Z])/g, '$1 $2'))
      expect(blocked).toContain(`requires ${r.level}; current ${r.level - 1}`)
    }
  })
}

// One prepared quote per distinct industrial decision; the engine owns prices,
// admission and restart. Render the same building inspector used by Facilities.
for (const [building, cost, blocker, explanation] of [
  [
    'Terraformer',
    ['0', '100000000000', '200000000000'],
    'EnergyRequired',
    'mine demand is not subtracted',
  ],
  [
    'Shipyard',
    ['800000000', '400000000', '200000000'],
    'YardLocked',
    'manufacturing',
  ],
  [
    'NaniteFactory',
    ['1000000000000', '500000000000', '100000000000'],
    'YardLocked',
    'manufacturing',
  ],
] as const) {
  it(`${building} displays the quoted industrial decision and its actual refusal`, async () => {
    const { view, source } = progressionFixture()
    const body = view.bodies[0]
    const key = { kind: 'Building', id: building } as const
    body.levels[building] = 1
    body.fields = 105
    body.fields_used = 100
    body.amounts = {
      metal: '5000000000000',
      crystal: '5000000000000',
      deuterium: '5000000000000',
    }
    const content =
      building === 'Terraformer'
        ? 'terraformer'
        : building === 'NaniteFactory'
          ? 'nanite'
          : null
    const entry: S['CatalogEntry3'] = {
      key,
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
      ...(content
        ? {
            technical_data: JSON.parse(
              readFileSync(
                `contracts/fixtures/${content}-technical-data.json`,
                'utf8',
              ),
            ),
          }
        : {}),
    }
    view.catalog = [entry]
    const request = { type: 'Upgrade', body: body.id, building } as const
    const [metal, crystal, deuterium] = cost
    const proposal: BoundProgressionOptions = {
      ...source,
      request,
      terms: {
        type: 'Building',
        action: 'Upgrade',
        body: body.id,
        building,
        profile_hash: view.profile_hash,
        source_level: 1,
        target_level: 2,
        paid: { metal, crystal, deuterium },
        duration_ms: 600000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: building === 'Terraformer' ? '2000000000' : '0',
        reserve_fields: 1,
      },
      ...(building === 'Terraformer'
        ? {
            building_benefit: {
              kind: 'FieldCapacity',
              current: '105',
              target: '110',
            },
          }
        : {}),
    }
    const store = createGameStore()
    store.setState({ view, binding: view.binding, ready: true })
    const render = async (quote: BoundProgressionOptions) => {
      const routeTree = createRootRoute({
        component: () =>
          createElement(BuildingDetails, {
            coordinator: { store, ready: true } as unknown as Coordinator,
            view,
            body,
            page: 'facilities',
            selection: {
              selectedId: building,
              close: vi.fn(),
              back: {
                href: '/u/andromeda/b/planet/facilities',
                'aria-label': 'Back to Facilities',
                onClick: vi.fn(),
              },
              link: () => ({
                href: '/u/andromeda/b/planet/facilities',
                'data-catalog-item': building,
                onClick: vi.fn(),
              }),
            },
            building: catalogContent(key),
            level: 1,
            proposal: quote,
            loading: false,
            error: '',
            action: 'Upgrade',
            onInspect: vi.fn(),
          }),
      })
      const router = createRouter({ routeTree, history: createMemoryHistory() })
      await router.load()
      return renderToStaticMarkup(createElement(RouterProvider, { router }))
    }
    const ready = await render(proposal)
    expect(ready).toContain('aria-label="Confirm upgrade"')
    for (const amount of cost.filter((n) => n !== '0'))
      expect(ready).toContain(
        `>${(BigInt(amount) / 1000000n).toLocaleString('en-US')}<`,
      )
    if (building === 'Terraformer') {
      expect(ready).toContain('+5 fields')
      expect(ready).toContain('Terraformer cannot be demolished')
      expect(ready).not.toContain('aria-label="Demolish Terraformer"')
    } else {
      expect(ready).toContain(
        `aria-label="Demolish ${building === 'Shipyard' ? 'Shipyard' : 'Nanite Factory'}"`,
      )
      if (building === 'NaniteFactory')
        expect(ready).toContain('Research is unaffected')
    }
    const refused = await render({
      ...proposal,
      blockers: [
        {
          code: blocker,
          requirement: null,
          required: blocker === 'EnergyRequired' ? '2000000000' : null,
          actual: blocker === 'EnergyRequired' ? '1000000000' : null,
          unit: blocker === 'EnergyRequired' ? 'MicroEnergy' : null,
          resource: null,
        },
      ],
    })
    expect(refused).toContain('aria-label="Action blockers"')
    expect(refused.toLowerCase()).toContain(explanation)
    expect(
      refused.match(/<button[^>]*aria-label="Confirm upgrade"[^>]*>/)?.[0],
    ).toContain('disabled')
  })
}
