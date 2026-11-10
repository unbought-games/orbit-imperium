import { useEffect, useState, type ReactNode, type MouseEvent } from 'react'
import { useStore } from 'zustand'
import {
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { createAppRouter } from '../../src/router'
import { SessionContext } from '../../src/shell/session-context'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { productionFixture } from '../../src/test-support/production'
import { progressionFixture } from '../../src/features/progression/progression-test-fixture'
import { Coordinator } from '../../src/client-model/coordinator'
import type {
  BoundProgressionOptions,
  GamePort,
  QueryContext,
} from '../../src/client-model/commands'
import type { components } from '../../src/contracts'
import { projectGameView } from '../../src/client-model/game-projection'
import { TechnologyPage } from '../../src/features/progression/technology-page'
import { ShipComparison } from '../../src/features/progression/ship-comparison'
import { UnitComparison } from '../../src/features/progression/unit-comparison'
import { catalogPage, catalogSlug } from '../../src/shell/catalog-routes'
import { Button } from '../../src/ui/button'
import type { ProgressionProps } from '../../src/features/progression/shared'
import rules from '../../../../rules/mvp-v1-slice-9.json'

type S = components['schemas']
const epoch = Date.UTC(2026, 10, 9, 12)
const emptyTechnical: S['TechnicalData3'] = {
  facts: [],
  bonuses: [],
  combat: null,
  storage_capacities: null,
}

export const shipStatistics: S['ShipStatistics3'] = {
  propulsion: {
    cargo_capacity: '7654',
    base_speed: '4321',
    fuel_consumption: '17',
    drive: 'CombustionDrive',
    impulse_upgrade: {
      minimum_level: 8,
      base_speed: '9876',
      fuel_consumption: '33',
    },
  },
  combat: {
    attack_ticks: '1234000',
    shield_ticks: '5678000',
    hull_ticks: '80000000',
    rapid_fire_against: [
      { unit: { kind: 'Ship', id: 'EspionageProbe' }, factor: '5' },
    ],
    rapid_fire_from: [],
  },
}

/** Controlled transport data only. The real Coordinator, selectors and detail
 * hooks own projection, inspection, eligibility and rendering. No API client. */
export async function createProgressionScene(params: URLSearchParams) {
  const protocol = params.get('protocol') === '3' ? 3 : 4
  const { session, snapshot } = readyFixture(protocol)
  if (snapshot.view.protocol === 2)
    throw Error('Modern progression fixture required')
  const view = snapshot.view
  const body = structuredClone(progressionFixture().view.bodies[0])
  body.id = id(5)
  body.amounts = {
    metal: '6661686240',
    crystal: '9420339537',
    deuterium: '3122000000',
  }
  body.capacity = {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  }
  body.inventories = [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' }]
  view.bodies = [body]
  view.progression.production = [
    {
      ...productionFixture(body),
      gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
    },
  ]
  view.viewer_revision = '1'
  view.sampled_at = view.as_of_ms = epoch
  snapshot.candidate.sampled_at = epoch
  view.catalog = structuredClone(rules.catalog) as S['CatalogEntry3'][]
  view.research = [{ research: 'CombustionDrive', level: 10 }]
  const mode = params.get('mode')
  const paid =
    mode === 'costs'
      ? { metal: '10000000000', crystal: '6000000000', deuterium: '2000000000' }
      : mode === 'ledger'
        ? { metal: '9007199254740993', crystal: '15000000', deuterium: '0' }
        : { metal: '60000000', crystal: '15000000', deuterium: '0' }
  if (mode === 'ledger')
    body.amounts.metal = body.amounts.crystal = '9007199254740993'
  if (mode === 'inventory') {
    body.amounts.metal = '60000001'
    body.inventories = [
      { item: { kind: 'Ship', id: 'SmallCargo' }, count: '9007199254740993' },
    ]
  }
  if (mode === 'active')
    view.constructions = [
      {
        id: id(20),
        body: body.id,
        building: 'RoboticsFactory',
        target_level: 1,
        paid,
        due_at: epoch + 76000,
      },
    ]
  if (mode === 'stats' || mode === 'legacy') {
    const cargo = view.catalog.find((entry) => entry.key.id === 'SmallCargo')!
    if (mode === 'stats') cargo.ship_statistics = shipStatistics
    else delete cargo.ship_statistics
  }
  let sequence = 100
  const metadata = (context: QueryContext) => ({
    protocol,
    binding: view.binding,
    request_id: context.request_id,
    viewer_revision: view.viewer_revision,
    sampled_at: epoch,
    as_of_ms: epoch,
  })
  const port: GamePort = {
    currentBinding: async (_universe, request_id) => ({
      ...snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({
      ...snapshot.settings,
      request_id: context.request_id,
    }),
    view: async (context) =>
      structuredClone({ ...view, request_id: context.request_id }),
    quote: async () => {
      throw Error('Unexpected legacy quote in progression component')
    },
    progressionOptions: async (
      context,
      request,
    ): Promise<BoundProgressionOptions> => {
      if (mode === 'active')
        throw Error('Deliberately unavailable active-work forecast')
      if (request.type === 'Transport')
        throw Error('Unexpected transport in progression component')
      const common = { profile_hash: view.profile_hash, paid }
      const terms: NonNullable<BoundProgressionOptions['terms']> =
        request.type === 'Manufacture'
          ? {
              ...common,
              type: 'Manufacture',
              body: request.body,
              item: request.item,
              quantity: request.quantity,
              unit_cost: paid,
              paid: {
                metal: (
                  BigInt(paid.metal) * BigInt(request.quantity)
                ).toString(),
                crystal: (
                  BigInt(paid.crystal) * BigInt(request.quantity)
                ).toString(),
                deuterium: (
                  BigInt(paid.deuterium) * BigInt(request.quantity)
                ).toString(),
              },
              unit_duration_ms: 30000,
              formula: 'ManufactureClassic',
              facilities: [],
            }
          : request.type === 'Research'
            ? {
                ...common,
                type: 'Research',
                host: request.host,
                research: request.research,
                source_level:
                  view.research.find((r) => r.research === request.research)
                    ?.level ?? 0,
                target_level:
                  (view.research.find((r) => r.research === request.research)
                    ?.level ?? 0) + 1,
                duration_ms: 60000,
                formula: 'ResearchClassic',
                labs: [],
                effective_lab: '1',
                required_energy: '0',
              }
            : {
                ...common,
                type: 'Building',
                body: request.body,
                building: request.building,
                action: request.type,
                source_level:
                  body.levels[request.building as keyof typeof body.levels] ??
                  0,
                target_level:
                  (body.levels[request.building as keyof typeof body.levels] ??
                    0) + (request.type === 'Upgrade' ? 1 : -1),
                duration_ms: 76000,
                formula: 'BuildingRedesign2011',
                facilities: [],
                required_energy: '0',
                reserve_fields: 1,
              }
      return {
        ...metadata(context),
        request,
        terms,
        terms_hash: 'b'.repeat(64),
        blockers:
          mode === 'blocked'
            ? [
                {
                  code: 'NoFreeField',
                  requirement: null,
                  required: null,
                  actual: null,
                  resource: null,
                  unit: null,
                },
              ]
            : [],
        estimates: null,
      }
    },
    submit: async () => {
      throw Error('Presentation component unexpectedly submitted an order')
    },
    receipt: async () => {
      throw Error('Presentation component unexpectedly requested a receipt')
    },
  }
  const model = new Coordinator(
    port,
    {
      load: async () => [],
      put: async () => {},
      remove: async () => {},
      clear: async () => {},
    },
    {
      newId: () => id(sequence++),
      monotonicNowMs: () => 0,
      isOnline: () => true,
    },
    false,
  )
  await model.initialize(structuredClone(session), structuredClone(snapshot))
  return { model, view }
}

function Routes({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return (
    <RouterContextProvider router={router}>{children}</RouterContextProvider>
  )
}

export function ProgressionDetailScenario() {
  const [runtime, setRuntime] = useState<Awaited<
    ReturnType<typeof createProgressionScene>
  > | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void createProgressionScene(new URLSearchParams(location.search)).then(
      (value) => {
        if (active) setRuntime(value)
      },
      (error) => {
        if (active) setError(String(error))
      },
    )
    return () => {
      active = false
    }
  }, [])
  return error ? (
    <p role="alert">{error}</p>
  ) : runtime ? (
    <PreparedDetail model={runtime.model} />
  ) : (
    <p role="status">Preparing progression component</p>
  )
}

function PreparedDetail({ model }: { model: Coordinator }) {
  const state = useStore(model.store)
  const view = projectGameView(state)
  const [selected, setSelected] = useState<string | null>(
    () => new URLSearchParams(location.search).get('item') ?? 'SmallCargo',
  )
  if (!view || view.protocol === 2)
    throw Error('Progression scene failed to initialize')
  const body = view.bodies[0]
  const entry = view.catalog.find((entry) => entry.key.id === selected)!
  const initialId =
    new URLSearchParams(location.search).get('item') ?? 'SmallCargo'
  const subject =
    entry ?? view.catalog.find((entry) => entry.key.id === initialId)!
  const page = catalogPage(subject.key)
  const href = (item: string | null) =>
    `/u/andromeda/b/${body.id}/${page}${item ? `/${catalogSlug(item)}` : ''}`
  const select = (item: string | null) => (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setSelected(item)
  }
  const selection: ProgressionProps['selection'] = {
    selectedId: selected,
    close: () => setSelected(null),
    back: {
      href: href(null),
      'aria-label': `Back to ${page === 'defense' ? 'Defense' : page === 'shipyard' ? 'Shipyard' : page === 'facilities' ? 'Facilities' : 'Research'}`,
      onClick: select(null),
    },
    link: (item) => ({
      href: href(item),
      'data-catalog-item': item,
      onClick: select(item),
    }),
  }
  return (
    <Routes>
      <SessionContext.Provider
        value={{
          universeName: 'andromeda',
          model,
          view,
          logout: async () => {},
          commands: {
            model,
            view,
            ready: model.ready,
            attempts: [...state.attempts.values()],
            send: async (command, quote) => {
              await model.send(command, quote)
            },
            retry: (command) => model.retryOrder(command),
            dismiss: (command) => model.dismiss(command),
            quote: async () => null,
          },
        }}
      >
        <main style={{ padding: 16 }}>
          <TechnologyPage
            coordinator={model}
            view={view}
            body={body}
            page={page}
            selection={selection}
          />
        </main>
      </SessionContext.Provider>
    </Routes>
  )
}

function comparisonCatalog(kind: 'Ship' | 'Defense'): S['CatalogEntry3'][] {
  if (kind === 'Ship')
    return (
      [
        ['LightFighter', '12500', 'CombustionDrive'],
        ['HeavyFighter', '10000', 'ImpulseDrive'],
      ] as const
    ).map(([id, speed, drive]) => ({
      key: { kind: 'Ship', id },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
      ship_statistics: {
        cost: ['3000', '1000', '0'],
        propulsion: {
          cargo_capacity: '50',
          base_speed: speed,
          fuel_consumption: '20',
          drive,
          drive_coefficient:
            drive === 'CombustionDrive' ? ['1', '10'] : ['1', '5'],
          impulse_upgrade: null,
        },
        combat: {
          attack_ticks: '5000000',
          shield_ticks: '1000000',
          hull_ticks: '40000000',
          technology_bonus: ['1', '10'],
          rapid_fire_against: [],
          rapid_fire_from: [],
        },
      },
    }))
  return (
    [
      ['RocketLauncher', ['2000', '0', '0'], '8000000'],
      ['LightLaser', ['1500', '500', '0'], '10000000'],
      ['SmallShieldDome', ['10000', '10000', '0'], '100000'],
    ] as const
  ).map(([id, cost, attack]) => ({
    key: { kind: 'Defense', id },
    enabled: true,
    mobile: false,
    requirements: [],
    body_kinds: ['Planet', 'Moon'],
    technical_data: {
      ...emptyTechnical,
      cost: [...cost],
      combat: {
        attack_ticks: attack,
        shield_ticks: '2000000',
        hull_ticks: '20000000',
        technology_bonus: ['1', '10'],
        rapid_fire_against: [],
        rapid_fire_from: [
          { unit: { kind: 'Ship', id: 'Bomber' }, factor: '20' },
        ],
      },
      facts: [
        {
          label: 'Recovery after combat',
          value:
            '7 / 10 chance for each destroyed defense to recover independently; not a guaranteed fraction of losses.',
          subject: null,
        },
        ...(id === 'SmallShieldDome'
          ? [
              {
                label: 'Body limit',
                value:
                  'One completed or queued dome of this type per planet or moon. Its shield protects itself, not other units.',
                subject: null,
              },
            ]
          : []),
      ],
    },
  }))
}

/** Prepared props exercise the real comparison's local selection and mode state.
 * External research/catalog changes are explicit, independent of app navigation. */
export function ProgressionComparisonScenario() {
  const kind =
    new URLSearchParams(location.search).get('kind') === 'Defense'
      ? 'Defense'
      : 'Ship'
  const [catalog, setCatalog] = useState(() => comparisonCatalog(kind))
  const [research, setResearch] = useState<S['Research3'][]>(() =>
    kind === 'Ship'
      ? [
          { research: 'CombustionDrive', level: 2 },
          { research: 'ImpulseDrive', level: 4 },
        ]
      : [
          { research: 'WeaponsTechnology', level: 3 },
          { research: 'ShieldingTechnology', level: 2 },
          { research: 'ArmourTechnology', level: 1 },
        ],
  )
  return (
    <main style={{ padding: 16 }}>
      <div aria-label="Prepared data controls">
        <Button
          onClick={() =>
            setResearch((current) =>
              current.map((r) =>
                r.research ===
                (kind === 'Ship' ? 'ImpulseDrive' : 'WeaponsTechnology')
                  ? { ...r, level: r.level + 1 }
                  : r,
              ),
            )
          }
        >
          Increase research
        </Button>
        <Button
          onClick={() =>
            setCatalog((current) =>
              current.map((entry) =>
                entry.key.id === 'HeavyFighter'
                  ? { ...entry, enabled: false }
                  : entry.key.id === 'LightFighter'
                    ? {
                        ...entry,
                        ship_statistics: {
                          ...entry.ship_statistics!,
                          propulsion: {
                            ...entry.ship_statistics!.propulsion!,
                            base_speed: '16000',
                          },
                        },
                      }
                    : entry,
              ),
            )
          }
        >
          Replace ship catalog
        </Button>
      </div>
      {kind === 'Ship' ? (
        <ShipComparison catalog={catalog} research={research} />
      ) : (
        <UnitComparison kind="Defense" catalog={catalog} research={research} />
      )}
    </main>
  )
}
