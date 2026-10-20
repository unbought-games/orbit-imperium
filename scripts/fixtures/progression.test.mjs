import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertFixtureDatabase } from './progression.mjs'
test('prepared states refuse development, production, malformed and arbitrary databases', () => {
  for (const name of [
    'orbit',
    'orbit_mvp_ui_local_20261015',
    'production',
    'orbit_raiding_',
    'orbit_raiding_0123456789ab_extra',
    'orbit_progression_0123456789xz',
  ])
    assert.throws(() => assertFixtureDatabase(name))
  for (const suite of ['progression', 'missions', 'raiding'])
    assert.doesNotThrow(() =>
      assertFixtureDatabase(`orbit_${suite}_0123456789ab`),
    )
})
