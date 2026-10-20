import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, unlink, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reserveTestPort } from './ports.mjs'
import { cleanupAll } from './cleanup.mjs'

test('port conflicts cannot skip later cleanup or secret removal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'orbit-cleanup-'))
  const secret = join(directory, 'credentials')
  await writeFile(secret, 'disposable-test-secret', { mode: 0o600 })
  const lease = await reserveTestPort()
  await lease.release()
  const intruder = await reserveTestPort(lease.port)
  const attempted = []
  try {
    await assert.rejects(
      cleanupAll([
        () => lease.hold(),
        () => {
          attempted.push('client')
          throw Error('client close failed')
        },
        () => {
          attempted.push('database')
        },
        () => unlink(secret),
        () => {
          attempted.push('port')
          return lease.release()
        },
      ]),
    )
    assert.deepEqual(attempted, ['client', 'database', 'port'])
    await assert.rejects(access(secret), { code: 'ENOENT' })
  } finally {
    await intruder.release()
    await lease.release()
    await rm(directory, { recursive: true, force: true })
  }
})
