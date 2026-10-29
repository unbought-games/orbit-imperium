import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
const schema = JSON.parse(
  readFileSync(new URL('../scenarios/schema.json', import.meta.url)),
)
const check = new Ajv({ allErrors: true, strict: false }).compile(schema)
test('playground and handwritten multi-user batches conform to the published schema', () => {
  for (const document of [
    JSON.parse(
      readFileSync(new URL('../scenarios/playground.json', import.meta.url)),
    ),
    {
      version: 1,
      edits: [
        { op: 'set', user: 'alice', planet: '1:50:8', ships: { CRUISER: 10 } },
        { op: 'set', user: 'bob', research: { astrophysics: 15 } },
        { op: 'set', user: 'alice', planet: '1:50:8', missiles: { InterplanetaryMissile: 10 } },
        { op: 'queue', user: 'alice', planet: '1:50:8', missiles: { AntiBallisticMissile: 2 } },
      ],
    },
  ])
    assert.ok(check(document), JSON.stringify(check.errors))
  assert.equal(
    check({ version: 1, edits: [{ op: 'set', planet: 'home' }] }),
    false,
  )
  assert.equal(
    check({ version: 1, edits: [{ op: 'set', unknown: true }] }),
    false,
  )
})
