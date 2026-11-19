import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unexpectedFixtureApi } from '../../apps/web/tests/fixtures/api-diagnostics.ts'

function reject(payload, path, operation) {
  const request = {
    method: () => 'POST',
    url: () => 'https://fixture.test/api/' + path + '?epoch=private',
    postDataJSON: () => JSON.parse(payload),
  }
  assert.throws(() => unexpectedFixtureApi({ request: () => request }), {
    message: 'Unexpected fixture API operation: POST /api/' + path + operation,
  })
}

test('the unexpected call identifies the bound operation without dumping payload or query data', () => {
  for (const [payload, operation] of [
    [{ type: 'System' }, 'System'],
    [{ query: { type: 'Conversations' } }, 'Conversations'],
    [{ action: { type: 'Equip' } }, 'Equip'],
    [{ source: { type: 'Galaxy' } }, 'Galaxy'],
    [{ request: { type: 'Repair' } }, 'Repair'],
    [
      {
        requests: [{ type: 'Repair' }, { type: 'Upgrade' }, { type: 'Repair' }],
      },
      'Repair, Upgrade',
    ],
    [{ command: { type: 'StartUpgrade' } }, 'StartUpgrade'],
    [
      {
        gameplay: {
          command: { type: 'World', action: { type: 'LaunchFleet' } },
        },
      },
      'LaunchFleet',
    ],
  ]) {
    reject(
      JSON.stringify({ ...payload, password: 'private' }),
      'world',
      ' (' + operation + ')',
    )
  }
  reject('null', 'world', '')
  reject('incomplete', 'world', ' (invalid JSON)')
})
