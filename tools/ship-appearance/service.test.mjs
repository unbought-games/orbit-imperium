import test from 'node:test'
import assert from 'node:assert/strict'
import { createRenderService } from './service.mjs'
const token = 'test-only-render-token-not-a-secret-12345678'
const input = {
  version: 1,
  request_id: '11111111-1111-4111-8111-111111111111',
  package_id: 'orbit-light-fighter',
  package_revision: 'concord-v1',
  colors: { primary: '#123456', accent: '#abcdef' },
  emblem: null,
}
const post = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(input),
}
async function fixture(render) {
  const { server, cancelAll } = createRenderService({ token, render })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      cancelAll()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
test('renderer authenticates and rejects schema/size violations before invoking expensive renderer', async () => {
  let calls = 0
  const service = await fixture(async (request) => {
    calls++
    return { version: 1, request_id: request.request_id, variants: [] }
  })
  try {
    assert.equal(
      (
        await fetch(service.url + '/v1/render', {
          ...post,
          headers: { 'content-type': 'application/json' },
        })
      ).status,
      401,
    )
    assert.equal(
      (
        await fetch(service.url + '/v1/render', {
          ...post,
          body: JSON.stringify({ ...input, shader: 'alert(1)' }),
        })
      ).status,
      400,
    )
    assert.equal(
      (
        await fetch(service.url + '/v1/render', {
          ...post,
          body: ' '.repeat(32769),
        })
      ).status,
      413,
    )
    assert.equal(calls, 0)
    assert.equal((await fetch(service.url + '/v1/render', post)).status, 200)
    assert.equal(calls, 1)
  } finally {
    await service.close()
  }
})
test('one active request, explicit cancellation, and retry recover without worker-owned job state', async () => {
  let enteredResolve
  const entered = new Promise((resolve) => {
    enteredResolve = resolve
  })
  let calls = 0
  const service = await fixture(async (request, signal) => {
    calls++
    if (calls === 1) {
      enteredResolve()
      await new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      )
    }
    return { version: 1, request_id: request.request_id, variants: [] }
  })
  try {
    const running = fetch(service.url + '/v1/render', post)
    await entered
    const busy = await fetch(service.url + '/v1/render', post)
    assert.equal(busy.status, 429)
    assert.equal(busy.headers.get('retry-after'), '1')
    assert.equal(
      (
        await fetch(service.url + '/v1/render/' + input.request_id, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
      202,
    )
    assert.equal((await running).status, 409)
    assert.equal((await fetch(service.url + '/v1/render', post)).status, 200)
    assert.equal(calls, 2)
  } finally {
    await service.close()
  }
})
test('caller disconnect aborts the active render and permits a new request', async () => {
  let enteredResolve, abortedResolve
  const entered = new Promise((resolve) => {
      enteredResolve = resolve
    }),
    aborted = new Promise((resolve) => {
      abortedResolve = resolve
    })
  const service = await fixture(async (_request, signal) => {
    enteredResolve()
    await new Promise((resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => {
          abortedResolve()
          reject(signal.reason)
        },
        { once: true },
      ),
    )
  })
  try {
    const controller = new AbortController()
    const request = fetch(service.url + '/v1/render', {
      ...post,
      signal: controller.signal,
    }).catch((error) => error)
    await entered
    controller.abort()
    await aborted
    await request
    assert.equal(
      (
        await fetch(service.url + '/v1/render/' + input.request_id, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
      404,
    )
  } finally {
    await service.close()
  }
})
