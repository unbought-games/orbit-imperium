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
import { SessionContext } from '../../src/shell/session-context'
import { routeTarget } from '../../src/shell/route-target'
import layout from '../../src/shell/game-shell.module.css'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { body } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import { ContentColumn } from '../../src/ui/content-column'
import { ErrorBannerProvider, ErrorBannerSlot } from '../../src/ui/error-banner'

type Header = components['schemas']['ReportHeader4']
async function prepare() {
  const { snapshot, session } = readyFixture(4)
  const view = snapshot.view
  if (view.protocol !== 4) throw Error('Expected report protocol 4')
  const time = Date.UTC(2026, 9, 30, 12)
  view.sampled_at = view.as_of_ms = snapshot.candidate.sampled_at = time
  view.viewer_revision = '1'
  view.bodies = [body]
  view.progression.production = [productionFixture(body)]
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
      if (
        action.type !== 'SetReportHidden' &&
        action.type !== 'SetReportsHidden'
      )
        return unexpected(action.type)
      submissions.push(envelope)
      const reports =
        action.type === 'SetReportHidden' ? [action.report] : action.reports
      for (const report of reports) {
        const row = headers.find((row) => row.id === report)
        if (!row) return unexpected(report)
        row.hidden = action.hidden
      }
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
    reportTriage: Awaited<ReturnType<typeof prepare>>
    releaseReportPort?: () => void
  }
}
const scene = await prepare()
const profiles = new PlayerProfilesController(async () => {
  throw Error('Unexpected profile query')
})

function Surface() {
  const commands = useCommands(null)
  const path = useRouterState({ select: (state) => state.location.pathname })
  useEffect(() => {
    window.reportTriage = scene
    return () => {
      window.releaseReportPort?.()
      Reflect.deleteProperty(window, 'reportTriage')
    }
  }, [])
  return (
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
                  {path.endsWith('/reports') ? (
                    <Reports
                      model={scene.model}
                      universe="andromeda"
                      origin={body.id}
                      item={null}
                      onDraft={() => {
                        throw Error('Unexpected dispatch')
                      }}
                    />
                  ) : (
                    <output aria-label="Opened route">{path}</output>
                  )}
                </ContentColumn>
              </div>
            </div>
          </div>
        </ErrorBannerProvider>
      </PlayerProfilesContext.Provider>
    </SessionContext.Provider>
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
      router.buildLocation(routeTarget('andromeda', 'reports', body.id)).href,
    )
    return router
  })
  return <RouterProvider router={router} />
}
