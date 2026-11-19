import assert from 'node:assert/strict'
import { exec, root } from './test-helpers.mjs'

export async function listBrowserCases(suite, { shard, signal } = {}) {
  const args = ['test', '--list', '--forbid-only', '--reporter=json']
  if (suite === 'source') args.push('--config=apps/web/tests')
  if (suite === 'components')
    args.push('--config=playwright.components.config.ts')
  if (shard) args.push(`--shard=${shard}`)
  const { stdout } = await exec(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', ...args],
    {
      cwd: root,
      env: {
        ...process.env,
        ORBIT_UI_E2E: '1',
        ORBIT_HOMEPAGE_E2E: suite === 'homepage' ? '1' : '',
      },
      signal,
    },
  )
  return JSON.parse(stdout)
}

// The JSON reporter nests describe blocks and expands each spec by project.
// Keep that ancestry when comparing inventories with repeated leaf titles.
export function* playwrightCases(suites, parents = []) {
  for (const suite of suites) {
    const path = [...parents, suite.title]
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        yield {
          file: spec.file,
          project: test.projectName,
          titlePath: [...path, spec.title],
          id: spec.id,
          tags: spec.tags,
          annotations: test.annotations,
          expectedStatus: test.expectedStatus,
          results: test.results,
        }
      }
    }
    yield* playwrightCases(suite.suites ?? [], path)
  }
}

// The outer suite names the file relative to that config's testDir.
export const caseKey = (item, file = item.file) =>
  JSON.stringify([file, item.project, ...item.titlePath.slice(1)])

export function requirePassingCase(item) {
  const key = caseKey(item)
  assert.equal(item.expectedStatus, 'passed', key)
  assert.ok(
    !item.annotations.some(({ type }) => type === 'fail'),
    `Required case is marked as expected to fail: ${key}`,
  )
}

export function verifyExecutedCases(expected, actual) {
  assert.deepEqual(
    actual.errors,
    [],
    'Playwright reported a worker or suite error',
  )
  const wanted = [...playwrightCases(expected.suites)].map((item) =>
    caseKey(item),
  )
  assert.ok(wanted.length, 'Expected a nonempty browser boundary')
  const ran = []
  for (const item of playwrightCases(actual.suites)) {
    requirePassingCase(item)
    const key = caseKey(item)
    assert.deepEqual(
      item.results.map(({ status, retry }) => [status, retry]),
      [['passed', 0]],
      `Required case must pass on its first execution: ${key}`,
    )
    ran.push(key)
  }
  assert.deepEqual(
    ran.sort(),
    wanted.sort(),
    'Executed cases differ from the intended boundary',
  )
}
