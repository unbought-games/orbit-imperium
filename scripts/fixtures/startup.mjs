import assert from 'node:assert/strict'
export function assertStartupRefused(result) {
  assert.equal(
    result.error,
    undefined,
    'Startup probe failed to execute or timed out',
  )
  assert.equal(
    result.signal,
    null,
    'Startup must reject configuration without being killed',
  )
  assert.equal(
    result.status,
    1,
    'Startup must refuse conflicting configuration',
  )
  assert.match(
    result.stderr.toString(),
    /Startup refused: incompatible schema\/profile or conflicting ORBIT_SPEED;/,
  )
}
