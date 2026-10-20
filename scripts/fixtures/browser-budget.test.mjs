import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserTimeout } from './browser-budget.mjs'

test('browser timeout accounts for setup and the earlier enclosing deadline', () => {
  assert.equal(browserTimeout(60, '60000', 15000), 43000)
  assert.equal(browserTimeout(90, '30000', 10000), 18000)
  assert.equal(browserTimeout(60, '120000', 10000), 58000)
  assert.equal(browserTimeout(60, undefined, 10000), 58000)
  assert.equal(browserTimeout(60, '12001', 10000), 1)
  assert.equal(browserTimeout(60, '12001.9', 10000), 1)
})

test('an exhausted or invalid deadline fails instead of disabling the timeout', () => {
  for (const deadline of ['12000', '12000.1', '12000.999', '11000', '9000', 'invalid']) {
    assert.throws(() => browserTimeout(60, deadline, 10000))
  }
})
