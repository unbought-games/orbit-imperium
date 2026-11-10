import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { load } from 'js-yaml'
import { loadConfigFromFile } from 'vite'
import { exec, root } from './test-helpers.mjs'

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
  const collectedFiles = new Set()
  const inventory = async (suite, shard) => {
    const { stdout } = await exec(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--list',
        '--reporter=json',
        ...(suite === 'components'
          ? ['--config=playwright.components.config.ts']
          : []),
        ...(shard ? [`--shard=${shard}`] : []),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          ORBIT_UI_E2E: '1',
          ORBIT_HOMEPAGE_E2E: '',
          ORBIT_BROWSER_SUITE: suite,
        },
        signal: t.signal,
      },
    )
    const report = JSON.parse(stdout)
    assert.equal(report.config.fullyParallel, true)
    assert.equal(report.config.globalTimeout, 0)
    for (const project of report.config.projects)
      assert.equal(project.timeout, 0)
    const collect = (suites) =>
      suites.flatMap((group) => [
        ...group.specs.flatMap((spec) => {
          if (!shard)
            collectedFiles.add(
              `${suite === 'components' ? 'components/' : ''}${spec.file}`,
            )
          return spec.tests.map((test) => `${spec.id}:${test.projectName}`)
        }),
        ...collect(group.suites ?? []),
      ])
    return collect(report.suites)
  }
  const all = [...(await inventory('all')), ...(await inventory('components'))]
  // New browser files must be deliberately placed, not silently omitted from
  // the curated application list. These existing full-system/production checks
  // have their own explicit runners and are intentionally outside this union.
  const separateRunners = new Set([
    'bootstrap.spec.ts',
    'construction.spec.ts',
    'login.spec.ts',
    'reconnect.spec.ts',
    'transport.spec.ts',
    'zfoundation.spec.ts',
    'signup.spec.ts',
    'raiding.spec.ts',
    'missions.spec.ts',
    'mvp.spec.ts',
    'progression.spec.ts',
    'responsive.spec.ts',
    'routing.spec.ts',
    'homepage-built.spec.ts',
  ])
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
    const tests = await inventory(job.suite, `${job.shard}/${job.shards}`)
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
