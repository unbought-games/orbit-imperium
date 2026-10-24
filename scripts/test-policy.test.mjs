import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { load } from 'js-yaml'
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

test('CI browser shards cover the full fixture suite exactly once', async (t) => {
  const workflow = load(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'))
  const shards = workflow.jobs.browser.strategy.matrix.shard
  const inventory = async (shard) => {
    const { stdout } = await exec(process.execPath, [
      'node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json',
      ...(shard ? [`--shard=${shard}/${shards.length}`] : []),
    ], { cwd: root, env: { ...process.env, ORBIT_UI_E2E: '1' }, signal: t.signal })
    const report = JSON.parse(stdout)
    assert.equal(report.config.fullyParallel, true)
    const collect = (suites) => suites.flatMap((suite) => [
      ...suite.specs.flatMap((spec) => spec.tests.map((test) => `${spec.id}:${test.projectName}`)),
      ...collect(suite.suites ?? []),
    ])
    return collect(report.suites)
  }
  const all = await inventory()
  const selected = []
  for (const shard of shards) {
    const tests = await inventory(shard)
    assert.ok(tests.length > 0, `shard ${shard} is not empty`)
    selected.push(...tests)
  }
  assert.equal(new Set(selected).size, selected.length, 'shards must not duplicate tests')
  assert.deepEqual(selected.sort(), all.sort(), 'shards must not omit or add tests')
})
