import { afterEach, expect, it, vi } from 'vitest'
import { createGameUpdatesPort } from './updates'
import { readyFixture } from '../test-support/bootstrap'
import type { GameUpdate } from '../client-model/commands'

afterEach(() => vi.unstubAllGlobals())
const binding = readyFixture(4).snapshot.candidate.binding
const event: GameUpdate = {
  binding,
  cursor: 'cursor-a',
  event: { type: 'Invalidate', minimum_viewer_revision: '3' },
}
function response(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
it('parses split SSE frames and awaits applied updates before consuming the next one', async () => {
  const wire = `: keepalive\r\n\r\nevent: game-update\r\nid: cursor-a\r\ndata: ${JSON.stringify(event)}\r\n\r\n`
  const fetch = vi.fn(async () =>
    response([wire.slice(0, 25), wire.slice(25), wire]),
  )
  vi.stubGlobal('fetch', fetch)
  let release!: () => void
  const gated = new Promise<void>((resolve) => {
    release = resolve
  })
  const received: GameUpdate[] = []
  const disconnected = vi.fn()
  const work = createGameUpdatesPort().subscribe(binding, 'previous', {
    signal: new AbortController().signal,
    onUpdate: async (update) => {
      received.push(update)
      await gated
    },
    onDisconnect: disconnected,
  })
  await vi.waitFor(() => expect(received).toHaveLength(1))
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/updates?epoch='),
    expect.objectContaining({
      credentials: 'same-origin',
      headers: expect.objectContaining({ 'Last-Event-ID': 'previous' }),
    }),
  )
  release()
  await work
  expect(received).toEqual([event, event])
  expect(disconnected).toHaveBeenCalledOnce()
})
it('rejects foreign binding and oversized messages before applying them', async () => {
  for (const data of [
    JSON.stringify({
      ...event,
      binding: { ...binding, player: '00000000-0000-4000-8000-000000000099' },
    }),
    'x'.repeat(300000),
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response([`event: game-update\nid: cursor-a\ndata: ${data}\n\n`]),
      ),
    )
    const onUpdate = vi.fn()
    await expect(
      createGameUpdatesPort().subscribe(binding, null, {
        signal: new AbortController().signal,
        onUpdate,
        onDisconnect: vi.fn(),
      }),
    ).rejects.toThrow()
    expect(onUpdate).not.toHaveBeenCalled()
  }
})
it('reports an unavailable old-server endpoint for fallback without inventing an outcome', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  )
  const onUpdate = vi.fn(),
    onDisconnect = vi.fn()
  await expect(
    createGameUpdatesPort().subscribe(binding, null, {
      signal: new AbortController().signal,
      onUpdate,
      onDisconnect,
    }),
  ).rejects.toMatchObject({ status: 404 })
  expect(onUpdate).not.toHaveBeenCalled()
  expect(onDisconnect).toHaveBeenCalledOnce()
})
