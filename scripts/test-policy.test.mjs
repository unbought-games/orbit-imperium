import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { load } from 'js-yaml'
import { loadConfigFromFile } from 'vite'
import { exec, root } from './test-helpers.mjs'
import { playwrightCases } from './playwright-cases.mjs'

test('native routine runners retain no execution deadline rather than finite defaults', async (t) => {
  const vite = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    join(root, 'apps/web/vite.config.ts'),
  )
  assert.equal(vite.config.test.testTimeout, 0)
  assert.equal(vite.config.test.hookTimeout, 0)
  const nextest = parse(
    readFileSync(join(root, '.config/nextest.toml'), 'utf8'),
  )
  assert.equal(nextest.profile.default['global-timeout'], undefined)
  assert.equal(
    typeof nextest.profile.default['slow-timeout'],
    'string',
    'warn only; no terminate-after',
  )
  assert.equal(nextest.profile.default.overrides, undefined)
  const { stdout } = await exec(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--list',
      '--reporter=json',
    ],
    { cwd: root, env: { ...process.env, ORBIT_UI_E2E: '1' }, signal: t.signal },
  )
  const report = JSON.parse(stdout)
  assert.equal(report.config.globalTimeout, 0)
  assert.ok(report.config.projects.length > 0)
  for (const project of report.config.projects) assert.equal(project.timeout, 0)
  assert.ok(report.suites.length > 0, 'routine browser tests remain selected')
})

test('CI browser boundaries and shards preserve every retained test exactly once', async (t) => {
  const workflow = load(
    readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
  )
  const jobs = workflow.jobs.browser.strategy.matrix.include
  const list = async (args, browserSuite) => {
    const { stdout } = await exec(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--list',
        '--forbid-only',
        '--reporter=json',
        ...args,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          ORBIT_UI_E2E: '1',
          ORBIT_HOMEPAGE_E2E: '',
          ORBIT_BROWSER_SUITE: browserSuite,
        },
        signal: t.signal,
      },
    )
    return JSON.parse(stdout)
  }
  // Collect directly from the directory without either runtime config. A
  // shared grep or testMatch can otherwise hide a test from both sides.
  const source = await list(['--config=apps/web/tests'], 'all')
  const separateRunners = new Set([
    'bootstrap.spec.ts',
    'construction.spec.ts',
    'login.spec.ts',
    'reconnect.spec.ts',
    'transport.spec.ts',
    'signup.spec.ts',
    'raiding.spec.ts',
    'missions.spec.ts',
    'mvp.spec.ts',
    'responsive.spec.ts',
    'routing.spec.ts',
    'homepage-built.spec.ts',
  ])
  const routine = [...playwrightCases(source.suites)].filter(
    (item) => !separateRunners.has(item.file),
  )
  const collectedFiles = new Set(routine.map((item) => item.file))
  // The first suite is the file, relative to the active config's testDir.
  const identity = (file, item) =>
    JSON.stringify([file, item.project, ...item.titlePath.slice(1)])
  const all = routine.map((item) => identity(item.file, item))
  const files = readdirSync(join(root, 'apps/web/tests'), {
    recursive: true,
  }).filter((file) => file.endsWith('.spec.ts') && !separateRunners.has(file))
  assert.deepEqual(
    [...collectedFiles].sort(),
    files.sort(),
    'every browser file needs an execution boundary',
  )
  const selected = []
  assert.deepEqual([...new Set(jobs.map((job) => job.suite))].sort(), [
    'components',
    'features',
    'journeys',
  ])
  for (const job of jobs) {
    const config =
      job.suite === 'components'
        ? ['--config=playwright.components.config.ts']
        : []
    const shard = `--shard=${job.shard}/${job.shards}`
    const report = await list([...config, shard], job.suite)
    assert.equal(report.config.fullyParallel, true)
    assert.equal(report.config.globalTimeout, 0)
    for (const project of report.config.projects)
      assert.equal(project.timeout, 0)
    const tests = Array.from(playwrightCases(report.suites), (item) => {
      const file =
        job.suite === 'components' ? `components/${item.file}` : item.file
      const key = identity(file, item)
      assert.equal(item.expectedStatus, 'passed', key)
      return key
    })
    assert.ok(tests.length > 0, `${job.suite} ${job.shard} is not empty`)
    selected.push(...tests)
  }
  assert.equal(
    new Set(selected).size,
    selected.length,
    'boundaries must not duplicate tests',
  )
  assert.deepEqual(
    selected.sort(),
    all.sort(),
    'boundary selection must not omit or add tests',
  )
})
