import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import type { components } from '../../contracts'
import type { Coordinator } from '../../client-model/coordinator'
import { createGameStore } from '../../client-model/game-store'
import { TechnologyDetails } from './technology-details'
import { TechnologyTree } from './technology-tree'
import { progressionFixture } from './progression-test-fixture'
import { manufacturingPreview } from './manufacturing-preview'
import { createManufacturingOrder } from './manufacturing-order'

vi.mock('../../shell/session-context', () => ({
  useUniverseName: () => 'andromeda',
}))
type S = components['schemas']
const examples = [
  {
    id: 'IonCannon',
    rules: 'mvp-v1-slice-10',
    levels: { Shipyard: 4 },
    research: { IonTechnology: 4 },
    cost: ['2000000000', '6000000000', '0'],
    total: ['6000000000', '18000000000', '0'],
  },
  {
    id: 'GaussCannon',
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
    rules: 'mvp-v1-heavy-laser',
    levels: { Shipyard: 4 },
    research: { EnergyTechnology: 3, LaserTechnology: 6 },
    cost: ['6000000000', '2000000000', '0'],
    total: ['18000000000', '6000000000', '0'],
  },
  {
    id: 'PlasmaTurret',
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
