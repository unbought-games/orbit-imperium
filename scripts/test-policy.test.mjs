import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { load } from 'js-yaml'
import { loadConfigFromFile } from 'vite'
import { exec, root } from './test-helpers.mjs'
import {
  caseKey,
  listBrowserCases,
  playwrightCases,
  requirePassingCase,
} from './playwright-cases.mjs'

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
  // Collect directly from the directory without either runtime config. A
  // shared grep or testMatch can otherwise hide a test from both sides.
  const source = await listBrowserCases('source', { signal: t.signal })
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
  const expected = { journeys: [], features: [], components: [] }
  for (const item of routine) {
    const suite = item.file.startsWith('components/')
      ? 'components'
      : item.tags.includes('journey')
        ? 'journeys'
        : 'features'
    expected[suite].push(caseKey(item))
  }
  const files = readdirSync(join(root, 'apps/web/tests'), {
    recursive: true,
  }).filter((file) => file.endsWith('.spec.ts') && !separateRunners.has(file))
  assert.deepEqual(
    [...collectedFiles].sort(),
    files.sort(),
    'every browser file needs an execution boundary',
  )
  const selected = { journeys: [], features: [], components: [] }
  assert.deepEqual([...new Set(jobs.map((job) => job.suite))].sort(), [
    'components',
    'features',
    'journeys',
  ])
  for (const job of jobs) {
    const report = await listBrowserCases(job.suite, {
      shard: `${job.shard}/${job.shards}`,
      signal: t.signal,
    })
    assert.equal(report.config.fullyParallel, true)
    assert.equal(report.config.globalTimeout, 0)
    for (const project of report.config.projects)
      assert.equal(project.timeout, 0)
    const tests = Array.from(playwrightCases(report.suites), (item) => {
      const file =
        job.suite === 'components' ? `components/${item.file}` : item.file
      requirePassingCase(item)
      return caseKey(item, file)
    })
    assert.ok(tests.length > 0, `${job.suite} ${job.shard} is not empty`)
    selected[job.suite].push(...tests)
  }
  const combined = Object.values(selected).flat()
  assert.equal(
    new Set(combined).size,
    combined.length,
    'boundaries must not duplicate tests',
  )
  for (const suite of Object.keys(expected)) {
    assert.deepEqual(
      selected[suite].sort(),
      expected[suite].sort(),
      `${suite} must contain its complete source inventory`,
    )
  }
  const expectedHomepage = [...playwrightCases(source.suites)]
    .filter((item) => item.file === 'homepage-built.spec.ts')
    .map((item) => caseKey(item))
  assert.ok(expectedHomepage.length > 0)
  const homepage = await listBrowserCases('homepage', { signal: t.signal })
  const selectedHomepage = Array.from(
    playwrightCases(homepage.suites),
    (item) => {
      requirePassingCase(item)
      return caseKey(item)
    },
  )
  assert.deepEqual(selectedHomepage.sort(), expectedHomepage.sort())
})
