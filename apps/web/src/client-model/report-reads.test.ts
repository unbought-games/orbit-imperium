import { expect, it, vi } from 'vitest'
import { Coordinator } from './coordinator'
import { gamePort } from '../adapters/http'
import { id, readyFixture } from '../test-support/bootstrap'
import { mergeReportHeaders } from './report-state'
import type { components } from '../contracts'

type Result = components['schemas']['ReportsReadResult']
async function setup() {
  const { session, snapshot } = readyFixture(4)
  const port = gamePort(session.csrf, snapshot.candidate)
  let sequence = 100
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
  )
  await model.initialize(session, snapshot)
  const refresh = vi.spyOn(model, 'refresh').mockResolvedValue()
  const header = (n: number) => ({
    id: id(n),
    kind: 'Espionage',
    observed_at: 1000,
    read: false,
    hidden: false,
    starred: false,
    shared: false,
  })
  model.store.setState({
    reportHeaders: mergeReportHeaders(
      new Map(),
      [header(10), header(11), header(12)],
      '1',
    ),
  })
  return { model, port, refresh, header }
}

it('sends only the displayed selection in one HTTP mutation, including lists over the old 16 KiB limit', async () => {
  const { model, header, refresh } = await setup()
  const shown = Array.from({ length: 5000 }, (_, i) => header(1000 + i))
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url, init) => {
      expect(String(url)).toMatch(/\/reports\/read$/)
      const request = JSON.parse(String(init?.body))
      expect(request.reports).toEqual(shown.map((h) => h.id))
      expect(Buffer.byteLength(String(init?.body))).toBeGreaterThan(16384)
      return new Response(
        JSON.stringify({
          ...request.context,
          viewer_revision: '2',
          items: shown.map((h) => ({ ...h, read: true })),
        }),
      )
    })
  try {
    await model.markReportsRead(shown.map((h) => h.id))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(
      model.store.getState().reportHeaders.get(id(1000))?.header.read,
    ).toBe(true)
    expect(model.store.getState().reportHeaders.get(id(10))?.header.read).toBe(
      false,
    )
    expect(model.store.getState().attempts.size).toBe(0)
    expect(refresh).toHaveBeenCalledWith('2')
  } finally {
    fetcher.mockRestore()
  }
})

it('applies a delayed read confirmation without replacing newer partial preference receipts', async () => {
  const { model, port, header } = await setup()
  let finish!: (result: Result) => void
  let context!: Result['binding']
  let requestId = ''
  port.markReportsRead = vi.fn<NonNullable<typeof port.markReportsRead>>(
    (request) => {
      context = request.binding
      requestId = request.request_id
      return new Promise((resolve) => {
        finish = resolve
      })
    },
  )
  const pending = model.markReportsRead([id(10), id(10), id(11)])
  expect(model.store.getState().reportHeaders.get(id(10))?.header.read).toBe(
    false,
  )
  model.store.setState({
    reportHeaders: mergeReportHeaders(
      model.store.getState().reportHeaders,
      // A preference receipt spreads the cached, still-unread header before
      // applying its star/archive fields at a newer revision.
      [{ ...header(10), read: false, starred: true, hidden: true }],
      '3',
    ),
  })
  finish({
    binding: context,
    request_id: requestId,
    viewer_revision: '2',
    items: [10, 11].map((n) => ({ ...header(n), read: true })),
  })
  await pending
  expect(
    model.store.getState().reportHeaders.get(id(10))?.header,
  ).toMatchObject({ read: true, starred: true, hidden: true })
  expect(model.store.getState().reportHeaders.get(id(11))?.header.read).toBe(
    true,
  )
  expect(model.store.getState().reportHeaders.get(id(12))?.header.read).toBe(
    false,
  )
})

it.each(['failure', 'missing', 'unread', 'context'] as const)(
  'does not report success or update headers after %s',
  async (mode) => {
    const { model, port, header, refresh } = await setup()
    port.markReportsRead = async (context) => {
      if (mode === 'failure') throw new Error('offline')
      if (mode === 'context') model.store.setState({ ready: false })
      return {
        ...context,
        viewer_revision: '2',
        items:
          mode === 'missing'
            ? []
            : [{ ...header(10), read: mode !== 'unread' }],
      }
    }
    await expect(model.markReportsRead([id(10)])).rejects.toThrow()
    expect(model.store.getState().reportHeaders.get(id(10))?.header.read).toBe(
      false,
    )
    expect(refresh).not.toHaveBeenCalled()
    expect(model.store.getState().attempts.size).toBe(0)
  },
)

it('does not send an empty selection', async () => {
  const { model, port } = await setup()
  port.markReportsRead = vi.fn()
  await model.markReportsRead([])
  expect(port.markReportsRead).not.toHaveBeenCalled()
})

it('requests only the latest recipient-visible target observation, including archives, without marking it read', async () => {
  const { model, header } = await setup()
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body))
      expect(request).toMatchObject({
        cursor: null,
        kind: 'Espionage',
        limit: 1,
        include_hidden: true,
        filter: { target_body: id(20), sort: 'newest' },
      })
      return new Response(
        JSON.stringify({
          protocol: 4,
          ...request.context,
          viewer_revision: '1',
          sampled_at: 1000,
          as_of_ms: 1000,
          data: {
            items: [header(12)],
            next_cursor: null,
            has_more: false,
            as_of_ms: 1000,
          },
        }),
      )
    })
  try {
    expect((await model.latestEspionage(id(20)))?.id).toBe(id(12))
    expect(fetcher).toHaveBeenCalledOnce()
    expect(model.store.getState().attempts.size).toBe(0)
  } finally {
    fetcher.mockRestore()
    model.invalidate()
  }
})
