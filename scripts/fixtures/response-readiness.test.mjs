import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { withProgressionResponse } from '../../apps/web/tests/fixtures/responses.ts'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function response(
  path,
  payload,
  { method = 'POST', ok = true, finished = Promise.resolve(null) } = {},
) {
  return {
    url: () => `https://fixture.test/api/v1${path}`,
    request: () => ({ method: () => method, postDataJSON: () => payload }),
    ok: () => ok,
    finished: () => finished,
  }
}

function fixture() {
  const received = deferred()
  let predicate
  return {
    page: {
      waitForResponse: (matches) => {
        predicate = matches
        return received.promise
      },
    },
    send: (value) => {
      assert.ok(predicate, 'response listener must precede navigation')
      if (predicate(value)) received.resolve(value)
      return predicate(value)
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
  test(`catalog readiness waits for the matching ${bulk ? 'bulk' : 'single'} response body after navigation`, async () => {
    const f = fixture()
    const body = deferred()
    let completed = false
    const ready = withProgressionResponse(f.page, matches, async () => {
      assert.equal(f.send(response('/overview', {}, { method: 'GET' })), false)
      assert.equal(
        f.send(
          response('/progression-options', {
            request: { ...wanted, body: 'other' },
          }),
        ),
        false,
      )
      assert.equal(
        f.send(
          response(
            '/progression-options',
            { request: wanted },
            { method: 'GET' },
          ),
        ),
        false,
      )
      assert.equal(
        f.send(
          response(
            bulk ? '/progression-options/bulk' : '/progression-options',
            bulk
              ? { requests: [{ ...wanted, building: 'CrystalMine' }, wanted] }
              : { request: wanted },
            { finished: body.promise },
          ),
        ),
        true,
      )
    }).then(() => {
      completed = true
    })
    // Drain resolved navigation/header work; only the controlled body is held.
    await setImmediate()
    assert.equal(completed, false)
    body.resolve(null)
    await ready
    assert.equal(completed, true)
  })
}

test('catalog readiness rejects failed HTTP and interrupted delivery instead of waiting for a later success', async () => {
  for (const options of [
    { ok: false },
    { finished: Promise.resolve(new Error('connection closed')) },
  ]) {
    const f = fixture()
    await assert.rejects(
      withProgressionResponse(f.page, matches, async () => {
        f.send(response('/progression-options', { request: wanted }, options))
      }),
    )
  }
})

test('catalog readiness propagates navigation failure', async () => {
  await assert.rejects(
    withProgressionResponse(fixture().page, matches, async () => {
      throw new Error('navigation failed')
    }),
    /navigation failed/,
  )
})
