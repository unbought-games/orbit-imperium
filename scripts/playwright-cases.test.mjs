import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyExecutedCases } from './playwright-cases.mjs'

// Minimal Playwright JSON reporter shape. Both describes have the same leaf.
function report(...groups) {
  const file = 'actions.spec.ts'
  return {
    errors: [],
    suites: [
      {
        title: file,
        specs: [],
        suites: groups.map((title) => ({
          title,
          specs: [
            {
              file,
              title: 'confirms the order',
              tags: [],
              tests: [
                {
                  projectName: '',
                  annotations: [],
                  expectedStatus: 'passed',
                  results: [{ retry: 0, status: 'passed' }],
                },
              ],
            },
          ],
        })),
      },
    ],
  }
}

test('executed inventory distinguishes same-file describe paths at equal total count', () => {
  const expected = report('catalog', 'review')
  verifyExecutedCases(expected, report('review', 'catalog'))
  assert.throws(
    () => verifyExecutedCases(expected, report('catalog', 'catalog')),
    /Executed cases differ/,
  )
})

test('collection, skipped executions and expected failures cannot satisfy required execution', () => {
  const expected = report('catalog')
  const actual = report('catalog')
  const item = actual.suites[0].suites[0].specs[0].tests[0]
  for (const results of [
    [],
    [{ retry: 0, status: 'skipped' }],
    [
      { retry: 0, status: 'failed' },
      { retry: 1, status: 'passed' },
    ],
  ]) {
    item.results = results
    assert.throws(
      () => verifyExecutedCases(expected, actual),
      /first execution/,
    )
  }
  // Before running, Playwright can report a test.fail annotation alongside
  // expectedStatus: "passed". Reading only expectedStatus loses that fact.
  item.results = [{ retry: 0, status: 'passed' }]
  item.annotations = [{ type: 'fail' }]
  assert.throws(() => verifyExecutedCases(expected, actual), /expected to fail/)
})
