import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLocalWorld, freePort } from './local-world.mjs'
test('worktree database identity is stable, isolated, and not inherited from ambient Compose', (t) => {
  const a = mkdtempSync(join(tmpdir(), 'orbit-world-a-')),
    b = mkdtempSync(join(tmpdir(), 'orbit-world-b-'))
  t.after(() => {
    rmSync(a, { recursive: true })
    rmSync(b, { recursive: true })
  })
  assert.equal(resolveLocalWorld(a).project, resolveLocalWorld(a).project)
  assert.notEqual(resolveLocalWorld(a).project, resolveLocalWorld(b).project)
  assert.match(
    resolveLocalWorld(a, { COMPOSE_PROJECT_NAME: 'production' }).project,
    /^orbit-dev-/,
  )
  assert.equal(resolveLocalWorld(a).env.ORBIT_DB_PUBLISHED_PORT, '0')
})
test('ports are assigned by the operating system', async () => {
  assert.ok((await freePort()) > 0)
})
