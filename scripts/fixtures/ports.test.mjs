import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reserveTestPort } from './ports.mjs'
test('concurrent runs reserve distinct ports and reject occupied overrides', async () => {
  const [first, second] = await Promise.all([
    reserveTestPort(),
    reserveTestPort(),
  ])
  try {
    assert.notEqual(first.port, second.port)
    await assert.rejects(reserveTestPort(String(first.port)), {
      code: 'EADDRINUSE',
    })
  } finally {
    await first.release()
    await second.release()
  }
  const reused = await reserveTestPort(String(first.port))
  await reused.release()
  await reused.release()
})

test('a lease protects every restart window, including explicit conflicts', async () => {
  const lease = await reserveTestPort()
  try {
    for (let restart = 0; restart < 20; restart++) {
      await lease.release()
      // Stand in for the real server owning the port until it exits.
      const server = await reserveTestPort(lease.port)
      await server.release()
      await lease.hold()
      await lease.hold()
      await assert.rejects(reserveTestPort(lease.port), { code: 'EADDRINUSE' })
    }
    await lease.release()
    const intruder = await reserveTestPort(lease.port)
    try {
      await assert.rejects(lease.hold(), { code: 'EADDRINUSE' })
    } finally {
      await intruder.release()
    }
    await lease.hold()
  } finally {
    await lease.release()
  }
})
