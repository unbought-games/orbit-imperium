import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'
import { createGameUpdatesPort } from './updates'
import { clientUpdate, ClientUpdateRequired } from './client-update'
import { readyFixture } from '../test-support/bootstrap'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('checks successful HTTP headers before attempting to parse an incompatible response', async () => {
  const observe = vi.spyOn(clientUpdate, 'observe').mockReturnValue(true)
  const response = new Response('not even JSON', {
    headers: { 'X-Orbit-Client-Build': 'new-build' },
  })
  const json = vi.spyOn(response, 'json')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
  await expect(request('/api/test')).rejects.toBeInstanceOf(
    ClientUpdateRequired,
  )
  expect(observe).toHaveBeenCalledWith('new-build')
  expect(json).not.toHaveBeenCalled()
})

it('does not reload into a failed deployment and retains the original HTTP failure', async () => {
  const observe = vi.spyOn(clientUpdate, 'observe')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { code: 'Unavailable' },
        { status: 503, headers: { 'X-Orbit-Client-Build': 'new-build' } },
      ),
    ),
  )
  await expect(request('/api/test')).rejects.toMatchObject({
    status: 503,
    code: 'Unavailable',
  })
  expect(observe).not.toHaveBeenCalled()
})

it('checks streaming headers before opening delivery or consuming events', async () => {
  vi.spyOn(clientUpdate, 'observe').mockReturnValue(true)
  const cancel = vi.fn()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: {
            'Content-Type': 'text/event-stream',
            'X-Orbit-Client-Build': 'new-build',
          },
        }),
    ),
  )
  const onConnect = vi.fn(),
    onUpdate = vi.fn(),
    onDisconnect = vi.fn()
  await expect(
    createGameUpdatesPort().subscribe(
      readyFixture(4).snapshot.candidate.binding,
      null,
      {
        signal: new AbortController().signal,
        onConnect,
        onUpdate,
        onDisconnect,
      },
    ),
  ).rejects.toBeInstanceOf(ClientUpdateRequired)
  expect(onConnect).not.toHaveBeenCalled()
  expect(onUpdate).not.toHaveBeenCalled()
  expect(onDisconnect).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalledOnce()
})
