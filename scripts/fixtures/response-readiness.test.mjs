import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { EventEmitter } from 'node:events'
import {
  trackFixtureResponses,
  withProgressionResponse,
} from '../../apps/web/tests/fixtures/responses.ts'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function response(path, payload, { method = 'POST', ok = true } = {}) {
  return {
    url: () => `https://fixture.test/api/v1${path}`,
    request: () => ({ method: () => method, postDataJSON: () => payload }),
    ok: () => ok,
  }
}

/** Delivers `requestfinished` events in order to the helper's predicate, as
 * Playwright does: cancelled or failed requests never finish. */
function fixture() {
  const finished = deferred()
  let predicate
  return {
    page: {
      waitForEvent: (event, { predicate: matches }) => {
        assert.equal(event, 'requestfinished')
        predicate = matches
        return finished.promise
      },
    },
    finish: async (value) => {
      assert.ok(predicate, 'response listener must precede navigation')
      const request = { response: async () => value }
      const matched = await predicate(request)
      if (matched) finished.resolve(request)
      return matched
    },
  }
}

const wanted = {
  type: 'Upgrade',
  body: 'planet',
  building: 'MetalMine',
}
const matches = (request) =>
  request.type === wanted.type &&
  request.body === wanted.body &&
  request.building === wanted.building

for (const bulk of [false, true]) {
  test(`catalog readiness waits for the matching ${bulk ? 'bulk' : 'single'} delivered response after navigation`, async () => {
    const f = fixture()
    const body = deferred()
    let completed = false
    const ready = withProgressionResponse(f.page, matches, async () => {
      assert.equal(
        await f.finish(response('/overview', {}, { method: 'GET' })),
        false,
      )
      assert.equal(
        await f.finish(
          response('/progression-options', {
            request: { ...wanted, body: 'other' },
          }),
        ),
        false,
      )
      assert.equal(
        await f.finish(
          response(
            '/progression-options',
            { request: wanted },
            { method: 'GET' },
          ),
        ),
        false,
      )
      body.promise.then(() =>
        f.finish(
          response(
            bulk ? '/progression-options/bulk' : '/progression-options',
            bulk
              ? { requests: [{ ...wanted, building: 'CrystalMine' }, wanted] }
              : { request: wanted },
          ),
        ),
      )
    }).then(() => {
      completed = true
    })
    await setImmediate()
    assert.equal(completed, false)
    body.resolve()
    await ready
    assert.equal(completed, true)
  })
}

test('catalog readiness rejects a failed HTTP status', async () => {
  const f = fixture()
  await assert.rejects(
    withProgressionResponse(f.page, matches, async () => {
      await f.finish(
        response('/progression-options', { request: wanted }, { ok: false }),
      )
    }),
  )
})

test('readiness waits for a finished request, not navigation alone', async () => {
  const f = fixture()
  let completed = false
  const ready = withProgressionResponse(f.page, matches, async () => {}).then(
    () => {
      completed = true
    },
  )
  await setImmediate()
  assert.equal(completed, false)
  assert.equal(
    await f.finish(response('/progression-options', { request: wanted })),
    true,
  )
  await ready
  assert.equal(completed, true)
})

test('catalog readiness propagates navigation failure', async () => {
  await assert.rejects(
    withProgressionResponse(fixture().page, matches, async () => {
      throw new Error('navigation failed')
    }),
    /navigation failed/,
  )
})

test('fixture phase changes wait for complete delivery, including requests started while draining', async () => {
  const page = new EventEmitter()
  const drain = trackFixtureResponses(page, (request) => request.overview)
  const first = { overview: true }
  const second = { overview: true }
  const unrelated = { overview: false }
  page.emit('request', first)
  page.emit('request', unrelated)
  let settled = 0
  const drains = [drain(), drain()].map((done) => done.then(() => settled++))
  page.emit('response', first)
  await setImmediate()
  assert.equal(
    settled,
    0,
    'headers alone must not release the next fixture phase',
  )
  page.emit('request', second)
  page.emit('requestfinished', first)
  await setImmediate()
  assert.equal(
    settled,
    0,
    'a later request still owns the previous response policy',
  )
  page.emit('requestfinished', second)
  await Promise.all(drains)
  assert.equal(settled, 2, 'unrelated requests must not block the phase change')
  await drain()
})

test('fixture draining handles intentional failures and keeps tracking the next phase', async () => {
  const page = new EventEmitter()
  const drain = trackFixtureResponses(page, () => true)
  for (const terminalEvent of ['requestfailed', 'requestfinished']) {
    const request = {}
    page.emit('request', request)
    let settled = false
    const done = drain().then(() => {
      settled = true
    })
    await setImmediate()
    assert.equal(settled, false)
    page.emit(terminalEvent, request)
    await done
    assert.equal(settled, true)
  }
})

test('page teardown with a late tracked request leaves no background response promise', async () => {
  const page = new EventEmitter()
  const drain = trackFixtureResponses(page, () => true)
  const request = {
    response: () =>
      assert.fail('tracking must not start an unowned response promise'),
  }
  await drain()
  page.emit('request', request)
  page.emit('close')
  await assert.rejects(drain(), /Fixture page closed/)
  for (const event of ['request', 'requestfinished', 'requestfailed']) {
    assert.equal(page.listenerCount(event), 0)
  }
})

test('page teardown rejects an active fixture drain instead of hanging or reporting success', async () => {
  const page = new EventEmitter()
  const drain = trackFixtureResponses(page, () => true)
  page.emit('request', {})
  const rejected = assert.rejects(drain(), /Fixture page closed/)
  page.emit('close')
  await rejected
})
