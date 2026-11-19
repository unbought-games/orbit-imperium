import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixtureOperation } from '../../apps/web/tests/fixtures/api-diagnostics.ts'

const describe = (payload, path = 'world') =>
  fixtureOperation({
    method: () => 'POST',
    url: () => 'https://fixture.test/api/' + path + '?epoch=private',
    postDataJSON: () => JSON.parse(payload),
  })

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
    assert.equal(
      describe(JSON.stringify({ ...payload, password: 'private' })),
      'POST /api/world (' + operation + ')',
    )
  }
  assert.equal(describe('null'), 'POST /api/world')
  assert.equal(describe('incomplete'), 'POST /api/world (invalid JSON)')
})
