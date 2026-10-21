import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { loadConfigFromFile } from 'vite'
import { exec, root } from './test-helpers.mjs'

test('native routine runners retain no execution deadline rather than finite defaults', async (t) => {
  const vite = await loadConfigFromFile({ command: 'serve', mode: 'test' }, join(root, 'apps/web/vite.config.ts'))
  assert.equal(vite.config.test.testTimeout, 0)
  assert.equal(vite.config.test.hookTimeout, 0)
  const nextest = parse(readFileSync(join(root, '.config/nextest.toml'), 'utf8'))
  assert.equal(nextest.profile.default['global-timeout'], undefined)
  assert.equal(typeof nextest.profile.default['slow-timeout'], 'string', 'warn only; no terminate-after')
  assert.equal(nextest.profile.default.overrides, undefined)
  const { stdout } = await exec(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json',
  ], { cwd: root, env: { ...process.env, ORBIT_UI_E2E: '1' }, signal: t.signal })
  const report = JSON.parse(stdout)
  assert.equal(report.config.globalTimeout, 0)
  assert.ok(report.config.projects.length > 0)
  for (const project of report.config.projects) assert.equal(project.timeout, 0)
  assert.ok(report.suites.length > 0, 'routine browser tests remain selected')
})
