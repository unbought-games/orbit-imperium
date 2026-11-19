import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import type { Envelope, GamePort } from '../../src/client-model/commands'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { useCommands } from '../../src/client-model/use-commands'
import type { components } from '../../src/contracts'
import { Reports } from '../../src/features/reports'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { AuthContext } from '../../src/shell/auth-context'
import { SessionContext } from '../../src/shell/session-context'
import { routeTarget } from '../../src/shell/route-target'
import layout from '../../src/shell/game-shell.module.css'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { body } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import { ContentColumn } from '../../src/ui/content-column'
import { ErrorBannerProvider, ErrorBannerSlot } from '../../src/ui/error-banner'

type Header = components['schemas']['ReportHeader4']
type ColonyObservation = {
  body: components['schemas']['BodyV3']
  header: Header
  payload: components['schemas']['ColonizedPayload4']
}
async function prepare() {
  const { snapshot, session } = readyFixture(4)
  const view = snapshot.view
  if (view.protocol !== 4) throw Error('Expected report protocol 4')
  const time = Date.UTC(2026, 9, 30, 12)
  view.sampled_at = view.as_of_ms = snapshot.candidate.sampled_at = time
  view.viewer_revision = '1'
  const colony = window.reportTriageColony
  view.bodies = colony ? [body, colony.body] : [body]
  view.progression.production = view.bodies.map(owned => productionFixture(owned))
  view.capabilities = [
    { capability: 'Reports', enabled: true, reason: 'Available' },
  ]
  const headers: Header[] = [
    {
      id: id(70),
      kind: 'Returned',
      observed_at: time - 120_000,
      read: false,
      hidden: false,
    },
    {
      id: id(71),
      kind: 'Espionage',
      observed_at: time - 600_000,
      read: false,
      hidden: false,
    },
    {
      id: id(72),
      kind: 'Espionage',
      observed_at: time - 3_600_000,
      read: true,
      hidden: false,
    },
    {
      id: id(73),
      kind: 'Delivered',
      observed_at: time - 10 * 86400_000,
      read: true,
      hidden: false,
    },
    {
      id: id(74),
      kind: 'Returned',
      observed_at: time - 10 * 86400_000,
      read: true,
      hidden: false,
      starred: true,
    },
    {
      id: id(75),
      kind: 'Delivered',
      observed_at: time - 30 * 86400_000,
      read: false,
      hidden: true,
    },
  ]
  if (colony) headers.unshift(structuredClone(colony.header))
  const submissions: Envelope[] = []
  const readBatches: string[][] = []
  const unexpected = (operation: string): never => {
    throw Error('Unexpected report scene request: ' + operation)
  }
  const bump = () => {
    view.viewer_revision = String(Number(view.viewer_revision) + 1)
  }
  const port: GamePort = {
    currentBinding: async (_, request_id) => ({
      ...snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({ ...snapshot.settings, ...context }),
    view: async (context) => structuredClone({ ...view, ...context }),
    quote: async () => unexpected('quote'),
    receipt: async () => unexpected('receipt'),
    reports: async (context, cursor, _includeHidden, query) => {
      if (!query) return unexpected('unscoped report list')
      if (new URLSearchParams(location.search).get('list') === 'unavailable')
        throw { status: 503, code: 'Unavailable' }
      const filter = query.filter
      const rows = headers.filter(
        (row) =>
          row.hidden === filter.hidden &&
          (!query.kind || row.kind === query.kind) &&
          (!filter.unread_only || !row.read) &&
          (!filter.starred_only || row.starred),
      )
      const offset = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0
      // One small page is sufficient by default. Tests of incomplete cleanup
      // hold the actual next page after opening the review.
      const items = rows.slice(offset, offset + (window.reportPageSize ?? 50))
      const hasMore = offset + items.length < rows.length
      return structuredClone({
        protocol: 4,
        ...context,
        sampled_at: time,
        viewer_revision: view.viewer_revision,
        as_of_ms: time,
        data: {
          items,
          has_more: hasMore,
          next_cursor: hasMore ? items.at(-1)!.id : null,
          as_of_ms: time,
          unread_count: headers.filter((row) => !row.hidden && !row.read)
            .length,
        },
      })
    },
    report: async (context, requested) => {
      const header = headers.find((row) => row.id === requested)
      if (colony && requested === colony.header.id && header?.kind === 'Colonized')
        return structuredClone({ ...context, protocol:4, viewer_revision:view.viewer_revision, sampled_at:time, as_of_ms:time, data:{header,payload:colony.payload} })
      if (header?.kind !== 'Espionage')
        return unexpected(`unprepared observation ${requested}`)
      return structuredClone({
        ...context,
        protocol: 4,
        viewer_revision: view.viewer_revision,
        sampled_at: time,
        as_of_ms: time,
        data: {
          header,
          ...(new URLSearchParams(location.search).has('historical')
            ? {
                player_names: { [id(9)]: 'Commander Vega' },
                player_alliances: {
                  [id(9)]: {
                    id: id(85),
                    universe: view.binding.universe,
                    name: 'Original alliance',
                    tag: 'OLD',
                  },
                },
              }
            : {}),
          payload: {
            kind: 'Espionage',
            observed_at: header.observed_at,
            target: {
              body: id(80),
              coordinates: { galaxy: 1, system: 2, position: 3 },
              owner: id(9),
              kind: 'Planet',
            },
            resources: { visibility: 'Unknown' },
            fleet: { visibility: 'Unknown' },
            defenses: { visibility: 'Unknown' },
            buildings: { visibility: 'Unknown' },
            research: { visibility: 'Unknown' },
            activity: { type: 'None' },
            counterespionage: { probability_ppm: 0, detected: false },
          },
        },
      })
    },
    markReportsRead: async (context, reports) => {
      readBatches.push([...reports])
      const items = headers.filter((row) => reports.includes(row.id))
      for (const row of items) row.read = true
      bump()
      return structuredClone({
        ...context,
        viewer_revision: view.viewer_revision,
        items,
      })
    },
    submit: async (envelope) => {
      if (envelope.command.type !== 'World')
        return unexpected(envelope.command.type)
      const action = envelope.command.action
      if (action.type === 'ArchiveReport') {
        const row = headers.find((r) => r.id === action.report)
        if (!row || !!row.shared !== action.revoke_share)
          return unexpected('detail archive revocation')
        row.hidden = true
        row.shared = false
      } else if (
        action.type === 'MarkReportRead' ||
        action.type === 'SetReportStarred'
      ) {
        const row = headers.find((r) => r.id === action.report)
        if (!row) return unexpected(action.report)
        if (action.type === 'MarkReportRead') row.read = true
        else row.starred = action.starred
      } else if (
        action.type === 'SetReportHidden' ||
        action.type === 'SetReportsHidden'
      ) {
        const reports =
          action.type === 'SetReportHidden' ? [action.report] : action.reports
        for (const report of reports) {
          const row = headers.find((r) => r.id === report)
          if (!row) return unexpected(report)
          row.hidden = action.hidden
        }
      } else return unexpected(action.type)
      submissions.push(envelope)
      bump()
      return {
        protocol: 4,
        binding: view.binding,
        command_id: envelope.command_id,
        status: 'Committed',
        admitted_at: time,
        executed_at: time,
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
    },
  }
  let sequence = 1000
  let elapsed = 0
  const model = new Coordinator(port, {
    newId: () => id(sequence++),
    monotonicNowMs: () => elapsed,
    isOnline: () => true,
  })
  await model.initialize(session, structuredClone(snapshot))
  return {
    model,
    session,
    port,
    headers,
    submissions,
    readBatches,
    view,
    advance(ms: number) {
      elapsed += ms
      model.tick()
    },
  }
}

declare global {
  interface Window {
    reportPageSize?: number
    reportTriageColony?: ColonyObservation
    reportTriage: Awaited<ReturnType<typeof prepare>>
    reportSourceProfiles: PlayerProfilesController
    releaseReportPort?: () => void
  }
}
const scene = await prepare()
const profiles = new PlayerProfilesController(async (source) => {
  if (
    !new URLSearchParams(location.search).has('historical') ||
    source.type !== 'Report' ||
    source.report !== id(71)
  )
    throw Error('Unexpected profile query')
  const now = Math.floor(Date.now() / 1000)
  return {
    binding: scene.view.binding,
    request_id: id(940),
    players: [
      {
        player: id(9),
        username: 'Commander Vega',
        observed_at: now,
        expires_at: now + 300,
        alliance: {
          id: id(85),
          universe: scene.view.binding.universe,
          name: 'Original alliance',
          tag: 'NEW',
        },
      },
    ],
  }
})

function Surface() {
  const commands = useCommands(null)
  const details = new URLSearchParams(location.search).has('details')
  const path = useRouterState({ select: (state) => state.location.pathname })
  useEffect(() => {
    window.reportTriage = scene
    window.reportSourceProfiles = profiles
    const stop = new URLSearchParams(location.search).has('historical')
      ? profiles.start()
      : undefined
    return () => {
      stop?.()
      delete (window as Partial<Window>).reportSourceProfiles
      window.releaseReportPort?.()
      Reflect.deleteProperty(window, 'reportTriage')
    }
  }, [])
  return (
    <AuthContext.Provider
      value={{
        runtime: {
          status: 'authenticated',
          signupEnabled: true,
          session: scene.session,
          source: 'document',
          game: { status: 'ready', model: scene.model },
        },
        busy: false,
        message: '',
        errorRef: { current: null },
        login: () => {},
        clearMessage: () => {},
      }}
    >
      <SessionContext.Provider
        value={{
          model: scene.model,
          commands,
          view: scene.view,
          logout: async () => {},
          universeName: 'Andromeda',
        }}
      >
        <PlayerProfilesContext.Provider value={profiles}>
          <ErrorBannerProvider model={scene.model}>
            <div className={layout['game-shell']} data-has-command-hud>
              <div className={layout['shell-columns']}>
                <div className={layout.center}>
                  <ContentColumn as="main" className={layout['work-area']}>
                    <h1 tabIndex={-1}>Reports</h1>
                    <ErrorBannerSlot model={scene.model} />
                    {path.endsWith('/reports') || details ? (
                      <Reports
                        model={scene.model}
                        universe="andromeda"
                        origin={body.id}
                        item={
                          path.endsWith('/reports')
                            ? null
                            : path.split('/').at(-1)!
                        }
                        onDraft={() => {
                          throw Error('Unexpected dispatch')
                        }}
                      />
                    ) : (
                      <output aria-label="Opened route">{path}</output>
                    )}
                    {details && (
                      <output aria-label="Mounted report route">{path}</output>
                    )}
                  </ContentColumn>
                </div>
              </div>
            </div>
          </ErrorBannerProvider>
        </PlayerProfilesContext.Provider>
      </SessionContext.Provider>
    </AuthContext.Provider>
  )
}

export function ReportTriageScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '$' }),
      ]),
      history: createMemoryHistory(),
    })
    router.history.replace(
      router.buildLocation(routeTarget('andromeda', 'reports', body.id, window.reportTriageColony?.header.id)).href,
    )
    return router
  })
  return <RouterProvider router={router} />
}
