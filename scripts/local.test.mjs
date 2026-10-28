import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
test('retired fixture commands explain the replacement without touching a database', () => {
  for (const command of ['dev-seed', 'dev-reset']) {
    const result = spawnSync(process.execPath, ['scripts/local.mjs', command], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /retired.*make dev/)
  }
})

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
test('operator defaults and explicit connection overrides are preserved', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'orbit-operator-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'target/debug'), { recursive: true })
  writeFileSync(
    join(root, 'target/debug/orbit'),
    `#!${process.execPath}\nconsole.log(JSON.stringify({args:process.argv.slice(2),url:process.env.DATABASE_URL,insecure:process.env.ORBIT_ALLOW_INSECURE_HTTP}))`,
    { mode: 0o755 },
  )
  const env = { ...process.env }
  delete env.DATABASE_URL
  delete env.ORBIT_DB_PASSWORD
  delete env.ORBIT_ALLOW_INSECURE_HTTP
  const call = () => {
    const r = spawnSync(
      process.execPath,
      [resolve('scripts/local.mjs'), 'db-init'],
      { cwd: root, env, encoding: 'utf8' },
    )
    assert.equal(r.status, 0, r.stderr)
    return JSON.parse(r.stdout)
  }
  assert.deepEqual(call(), {
    args: ['db-init'],
    url: 'postgres://orbit:orbit@127.0.0.1:55432/orbit',
    insecure: '1',
  })
  env.ORBIT_DB_PASSWORD = 'local@password:/?#%'
  assert.equal(
    decodeURIComponent(new URL(call().url).password),
    env.ORBIT_DB_PASSWORD,
  )
  env.DATABASE_URL = 'postgres://test:password@example.test/custom'
  env.ORBIT_ALLOW_INSECURE_HTTP = '0'
  assert.equal(call().url, env.DATABASE_URL)
  assert.equal(call().insecure, '0')
})
