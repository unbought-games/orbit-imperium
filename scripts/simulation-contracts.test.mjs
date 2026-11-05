import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
const schema = JSON.parse(readFileSync('contracts/openapi.json', 'utf8'))
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const validate = ajv.compile({ components: schema.components, $ref: '#/components/schemas/SimulationSample' })
test('simulation samples require exact newly generated debris, including explicit zero deuterium', () => {
  const sample = { outcome: 'Draw', rounds: 6, attacker: [], defender: [], surviving_cargo_capacity: '0', estimated_loot: null,
    debris: { metal: '9007199254740993', crystal: '2000000', deuterium: '0' } }
  assert.equal(validate(sample), true)
  const { debris, ...missing } = sample
  assert.equal(validate(missing), false)
  for (const invalid of [null, { metal: '0', crystal: '0' }, { ...debris, metal: '-1' }, { ...debris, deuterium: 0 }])
    assert.equal(validate({ ...sample, debris: invalid }), false)
})
