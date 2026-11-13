import { useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import { attemptStorage } from '../../src/adapters/attempt-storage'
import {
  readyFixture,
  memoryStorage,
  id,
} from '../../src/test-support/bootstrap'
import { ReportListRow } from '../../src/features/report-list-row'
import { ReportObservation } from '../../src/features/report-observation'
import { useMobileLayout } from '../../src/ui/use-mobile-layout'
import { useCommands } from '../../src/client-model/use-commands'
import { SessionContext } from '../../src/shell/session-context'
import type { components } from '../../src/contracts'
import { sharedCombatReport } from './report-data'

const loot = {
  metal: '37827000000',
  crystal: '21881000000',
  deuterium: '2465000000',
}
const names = { attacker: 'Vega', defender: 'Sol', long: 'mom_said_log_off' }
const at = { galaxy: 1, system: 93, position: 6 }
const payload = {
  ...sharedCombatReport(true),
  outcome: 'AttackerVictory',
  survivors: sharedCombatReport(true).participants.map((p) =>
    p.side === 'Defender' ? { ...p, units: [] } : p,
  ),
  loot,
  debris: {
    metal: '29000000000',
    crystal: '51000000000',
    deuterium: '7000000000',
  },
  own_cargo_loss: {
    metal: '1000000000',
    crystal: '2000000000',
    deuterium: '0',
  },
}
const previews: components['schemas']['ReportPreview4'][] = [
  {
    kind: 'Combat',
    outcome: 'AttackerVictory',
    target: at,
    target_name: 'Sol',
    loot,
    debris: payload.debris,
    participants: [
      { owner: 'attacker', side: 'Attacker' },
      { owner: 'defender', side: 'Defender' },
    ],
  },
  ...['attacker', 'long'].map((owner) => ({
    kind: 'Espionage' as const,
    target: {
      owner,
      body: id(9),
      coordinates: at,
      name: owner === 'long' ? 'Scarlet Meridian' : 'Io',
      kind: 'Planet' as const,
    },
    resources: { visibility: 'Known' as const, value: loot },
  })),
  {
    kind: 'Delivered',
    origin: at,
    target: { ...at, position: 7 },
    origin_name: 'Sol',
    target_name: 'VeryLongUnbrokenDestinationColonyName',
    cargo: loot,
  },
]

function ReportsScene() {
  const [model] = useState(() => {
    const unexpected = async (): Promise<never> => {
      throw Error('Unexpected report scene transport')
    }
    const coordinator = new Coordinator(
      {
        currentBinding: unexpected,
        settings: unexpected,
        view: unexpected,
        quote: unexpected,
        submit: unexpected,
        receipt: unexpected,
      },
      attemptStorage(memoryStorage()),
      { newId: () => id(99), monotonicNowMs: () => 1000, isOnline: () => true },
    )
    const view = readyFixture(4).snapshot.view
    view.binding = { ...view.binding, player: 'defender' }
    coordinator.store.setState({ ready: true, view, binding: view.binding })
    return coordinator
  })
  const [selected, select] = useState(false)
  const [opened, open] = useState(false)
  const mobile = useMobileLayout()
  const commands = useCommands(null)
  const view = model.store.getState().view!
  return (
    <SessionContext.Provider
      value={{
        model,
        view,
        commands,
        universeName: 'Andromeda',
        logout: async () => {},
      }}
    >
      <main style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
        <h1>Reports</h1>
        <section aria-label="Report list">
          {previews.map((preview, index) => (
            <ReportListRow
              key={index}
              report={{
                id: id(70 + index),
                kind: preview.kind,
                preview,
                observed_at: 0,
                read: index === 1,
                hidden: index === 1,
              }}
              playerNames={names}
              model={model}
              universe="andromeda"
              origin={id(5)}
              now={1000000}
              disabled={false}
              desktopSelection={!mobile}
              selected={selected}
              onSelect={(value) => select(value)}
              onOpen={() => open(true)}
            />
          ))}
        </section>
        <output aria-label="Report opened">
          {opened ? 'Opened' : 'Not opened'}
        </output>
        <ReportObservation
          payload={payload}
          viewer="defender"
          playerNames={names}
        />
      </main>
    </SessionContext.Provider>
  )
}
export function ReportReadabilityScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: ReportsScene })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '$' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  })
  return <RouterProvider router={router} />
}
