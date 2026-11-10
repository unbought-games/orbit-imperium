import { useState, type ReactNode } from 'react'
import {
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { createAppRouter } from '../../src/router'
import { readyFixture } from '../../src/test-support/bootstrap'
import { tutorialFixture } from '../../src/test-support/tutorial'
import { createGameStore } from '../../src/client-model/game-store'
import { VacationSettingsView } from '../../src/features/vacation'
import { EmpireDeletionView } from '../../src/features/empire-deletion'
import { vacationState } from '../../src/features/settings-state'
import { TutorialChapters } from '../../src/features/tutorial/chapters'
import { TutorialExperienceControl } from '../../src/features/tutorial/experience-action'
import { ProgressionObjectiveCardView } from '../../src/features/tutorial/objective-card'
import { objectiveStatus } from '../../src/features/tutorial/model'

const epoch = Date.parse('2030-01-01T00:00:00Z')
function viewFixture() {
  const { snapshot } = readyFixture(4)
  if (snapshot.view.protocol !== 4) throw Error('fixture')
  snapshot.view.sampled_at = epoch
  snapshot.view.bodies = [
    {
      id: tutorialFixture().homeworld!,
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: { metal: '0', crystal: '0', deuterium: '0' },
      capacity: {
        metal: '999999999999',
        crystal: '999999999999',
        deuterium: '999999999999',
      },
      levels: {},
      fields: 163,
      fields_used: 0,
      fields_reserved: 0,
      energy: { supply: '0', demand: '0', utilization: '1000000' },
      inventories: [],
    },
  ]
  snapshot.view.vacation = {
    active: false,
    entered_at: null,
    earliest_exit_at: null,
    blockers: [],
  }
  return snapshot.view
}
function Routing({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  return (
    <RouterContextProvider router={router}>{children}</RouterContextProvider>
  )
}

export function VacationScenario() {
  const [view, setView] = useState(viewFixture)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [calls, setCalls] = useState<string[]>([])
  const action = vacationState({
    ...createGameStore().getState(),
    ready: true,
    view,
    now: epoch,
    receivedAt: epoch,
  })
  return (
    <Routing>
      <main>
        <VacationSettingsView
          view={view}
          universeName="Andromeda"
          action={{
            ...action,
            pending,
            error,
            submit: async (enter) => {
              setCalls((old) => [...old, enter ? 'enter' : 'exit'])
              return 'fixture'
            },
          }}
        />
        <aside aria-label="Fixture controls">
          <button onClick={() => setPending(true)}>Set pending</button>
          <button
            onClick={() => {
              setPending(false)
              setView({
                ...view,
                vacation: {
                  active: true,
                  entered_at: epoch,
                  earliest_exit_at: epoch + 172800000,
                  blockers: [],
                },
              })
            }}
          >
            Receive vacation
          </button>
          <button
            onClick={() =>
              setView({
                ...view,
                vacation: {
                  active: true,
                  entered_at: epoch - 172800000,
                  earliest_exit_at: epoch,
                  blockers: [],
                },
              })
            }
          >
            Receive eligible vacation
          </button>
          <button
            onClick={() => {
              setPending(false)
              setView({
                ...view,
                vacation: {
                  active: false,
                  entered_at: null,
                  earliest_exit_at: null,
                  blockers: [],
                },
              })
            }}
          >
            Receive inactive vacation
          </button>
          <button
            onClick={() =>
              setView({
                ...view,
                vacation: {
                  active: false,
                  entered_at: null,
                  earliest_exit_at: null,
                  blockers: (
                    [
                      'Construction',
                      'Manufacturing',
                      'Research',
                      'Fleet',
                      'Missile',
                      'HostedFleet',
                    ] as const
                  ).map((kind) => ({
                    kind,
                    body:
                      kind === 'Research' ||
                      kind === 'Fleet' ||
                      kind === 'Missile'
                        ? null
                        : view.bodies[0].id,
                  })),
                },
              })
            }
          >
            Receive blockers
          </button>
          <button
            onClick={() => {
              setPending(false)
              setError('The server rejected this change.')
            }}
          >
            Receive rejection
          </button>
        </aside>
        <output aria-label="Submitted vacation actions">
          {calls.join(',')}
        </output>
      </main>
    </Routing>
  )
}

export function EmpireDeletionScenario() {
  const [view, setView] = useState(viewFixture)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [calls, setCalls] = useState<string[]>([])
  return (
    <main>
      <EmpireDeletionView
        view={view}
        universeName="Andromeda"
        action={{
          pending,
          error,
          ready: true,
          failed: false,
          message: '',
          submit: async (mode) => {
            setCalls((old) => [...old, mode])
          },
        }}
      />
      <aside aria-label="Fixture controls">
        <button onClick={() => setPending(true)}>Set pending</button>
        <button
          onClick={() => {
            setPending(false)
            setView({
              ...view,
              empire_deletion: {
                reason: 'Requested',
                due_at: epoch + 604800000,
              },
            })
          }}
        >
          Receive requested deletion
        </button>
        <button
          onClick={() => {
            setPending(false)
            setView({
              ...view,
              empire_deletion: {
                reason: 'Inactivity',
                due_at: epoch + 604800000,
              },
            })
          }}
        >
          Receive inactivity deletion
        </button>
        <button
          onClick={() => {
            setPending(false)
            setView({ ...view, empire_deletion: undefined })
          }}
        >
          Receive cancelled deletion
        </button>
        <button onClick={() => setView({ ...view, leads_alliance: true })}>
          Receive leader status
        </button>
        <button
          onClick={() => {
            setPending(false)
            setError('Sign out and sign in again to request deletion.')
          }}
        >
          Receive sign-in rejection
        </button>
      </aside>
      <output aria-label="Submitted deletion actions">{calls.join(',')}</output>
    </main>
  )
}

export function TutorialChaptersScenario() {
  const [data] = useState(() => tutorialFixture())
  const [view] = useState(viewFixture)
  return (
    <Routing>
      <main>
        <TutorialChapters data={data} view={view} universeName="Andromeda" />
      </main>
    </Routing>
  )
}

export function TutorialExperienceScenario() {
  const [data, setData] = useState(() => tutorialFixture())
  const [pending, setPending] = useState(false)
  const [calls, setCalls] = useState(0)
  return (
    <main>
      <TutorialExperienceControl
        page="briefing"
        data={data}
        pending={pending}
        onConfirm={() => setCalls((n) => n + 1)}
      />
      <aside aria-label="Fixture controls">
        <button onClick={() => setPending(true)}>Set pending</button>
        <button onClick={() => setData({ ...data, beginner: false })}>
          Receive full experience
        </button>
      </aside>
      <output aria-label="Preference submissions">{calls}</output>
      <output aria-label="Recorded receipts">{data.receipts.length}</output>
    </main>
  )
}

export function TutorialRewardScenario() {
  const [data] = useState(() => {
    const data = tutorialFixture()
    const objective = data.chapters[0].objectives[0]
    const terms = objective.inspection!.terms!
    if (terms.type !== 'Building') throw Error('fixture')
    terms.source_level = 9
    terms.target_level = 10
    terms.paid.metal = '61150000000'
    data.recommended_objectives = [objective.id]
    return data
  })
  const [view] = useState(viewFixture)
  const objective = data.chapters[0].objectives[0]
  return (
    <Routing>
      <main>
        <ProgressionObjectiveCardView
          objective={objective}
          status={objectiveStatus(objective, data, view)}
          universe="Andromeda"
        />
        <TutorialChapters data={data} view={view} universeName="Andromeda" />
      </main>
    </Routing>
  )
}
