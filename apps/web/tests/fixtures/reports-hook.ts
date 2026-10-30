// Mounted only by fixture browser tests to exercise hook lifetimes independently
// of the router's choice to preserve or remount a screen.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mergeReportHeaders } from '../../src/client-model/report-state'
import { createGameStore } from '../../src/client-model/game-store'
import { readyFixture } from '../../src/test-support/bootstrap'
import { useReports } from '../../src/features/use-reports'
import type {
  ReportDetail,
  ReportsPage,
} from '../../src/features/reports-state'
import type { Command } from '../../src/client-model/commands'

export async function reportsHarness() {
  const store = createGameStore()
  const { snapshot } = readyFixture(4)
  store.setState({
    binding: snapshot.candidate.binding,
    view: snapshot.view,
    ready: true,
  })
  const calls: Array<{
    item: string | null
    cursor: string | null
    includeHidden: boolean
    resolve: (value: ReportsPage | ReportDetail | null) => void
    reject: (error: unknown) => void
  }> = []
  const sent: Command[] = []
  const read = (item: string | null, cursor: string | null, includeHidden = false) =>
    new Promise<ReportsPage | ReportDetail | null>((resolve, reject) => {
      calls.push({ item, cursor, includeHidden, resolve, reject })
    })
  const model = {
    store,
    reportPage: (cursor: string | null = null, includeHidden = false) =>
      read(null, cursor, includeHidden) as Promise<ReportsPage | null>,
    reportDetail: (item: string) =>
      read(item, null) as Promise<ReportDetail | null>,
    send: async (command: Command) => {
      sent.push(command)
      return 'command'
    },
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let result!: ReturnType<typeof useReports>
  function Probe({ item, includeHidden = false }: { item: string | null; includeHidden?: boolean }) {
    result = useReports(model, item, false, false, includeHidden)
    return null
  }
  await act(async () => root.render(createElement(Probe, { item: null })))
  return {
    calls,
    sent,
    state: () => ({
      ids: result.page?.items.map((r) => r.id) ?? [],
      detail: result.detail?.header.id ?? null,
      error: result.error,
      loading: result.loading,
      loadingMore: result.loadingMore,
    }),
    folder: async (includeHidden: boolean) => act(async () => root.render(createElement(Probe, { item: null, includeHidden }))),
    navigate: async (item: string | null) =>
      act(async () => root.render(createElement(Probe, { item }))),
    more: async () =>
      act(async () => {
        result.more()
        result.more()
      }),
    retry: async () => act(async () => result.retry()),
    resolve: async (index: number, data: ReportsPage | ReportDetail | null) =>
      act(async () => {
        if (data)
          store.setState((s) => ({
            reportHeaders: mergeReportHeaders(
              s.reportHeaders,
              'header' in data ? [data.header] : data.items,
              s.view!.viewer_revision,
            ),
          }))
        calls[index].resolve(data)
      }),
    reject: async (index: number) =>
      act(async () => calls[index].reject('old failure')),
    revise: async () =>
      act(async () =>
        store.setState((s) => ({
          view: {
            ...s.view!,
            viewer_revision: String(BigInt(s.view!.viewer_revision) + 1n),
          },
        })),
      ),
    rebind: async () =>
      act(async () =>
        store.setState((s) => ({
          binding: { ...s.binding!, epoch: 'new-epoch' },
        })),
      ),
    visibility: async () =>
      act(async () => {
        result.invalidate()
        store.setState({
          attempts: new Map([
            [
              'visibility',
              {
                status: 'submitting',
                reconciled: false,
                receipt: null,
                envelope: {
                  protocol: 4,
                  binding: store.getState().binding!,
                  presence: null,
                  command_id: 'visibility',
                  command: {
                    type: 'World',
                    action: {
                      type: 'SetReportHidden',
                      report: 'a',
                      hidden: true,
                    },
                  },
                },
              },
            ],
          ]),
        })
      }),
    settleVisibility: async () =>
      act(async () => store.setState({ attempts: new Map() })),
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

export function reportDetail(
  id: string,
  read = true,
  hidden = false,
): ReportDetail {
  return {
    header: { id, read, hidden, kind: 'ContactLost', observed_at: 100 },
    payload: {
      kind: 'ContactLost',
      at: 100,
      target: { galaxy: 1, system: 1, position: 1 },
      own_lost_ships: [],
      own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
    },
  }
}
export function reportPage(ids: string[], cursor: string | null): ReportsPage {
  return {
    items: ids.map((id) => reportDetail(id).header),
    next_cursor: cursor,
    has_more: cursor !== null,
    as_of_ms: 100,
  }
}
