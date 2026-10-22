import { globSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const schemas = JSON.parse(readFileSync('contracts/openapi.json')).components.schemas
const vocabulary = ['BuildingId3', 'ResearchId3', 'ShipId3', 'DefenseId3', 'MissileId']
const ids = new Set(vocabulary.flatMap(name => schemas[name].enum))
// These are intentionally frozen protocol-1/2 contracts. Never expand old command grammars.
const legacy = new Set(['Ship', 'Body', 'Construction', 'QuoteRequest', 'Command',
  'ShipRequest', 'ResearchId', 'ItemKey', 'CatalogKey', 'Requirement', 'BodyV2'])

test('modern consumers reference canonical content IDs instead of copying a subset', () => {
  function inspect(node, path) {
    if (!node || typeof node !== 'object') return
    assert.ok(!node.enum?.some(value => ids.has(value)), `${path}: use a shared content ID reference`)
    assert.ok(!Object.keys(node.properties ?? {}).some(key => ids.has(key)), `${path}: use a shared level map`)
    for (const [key, value] of Object.entries(node)) inspect(value, `${path}/${key}`)
  }
  for (const [name, definition] of Object.entries(schemas))
    if (!legacy.has(name) && !vocabulary.includes(name)) inspect(definition, name)
})

test('every bundled catalog and rules expansion is represented by the shared vocabulary', () => {
  const mapping = { Building: 'BuildingId3', Research: 'ResearchId3', Ship: 'ShipId3', Defense: 'DefenseId3', Missile: 'MissileId' }
  // The catalog includes disabled content; enabled subsets must not narrow the wire contract.
  const catalogs = globSync('rules/*.json')
    .map(path => JSON.parse(readFileSync(path)))
    .filter(rules => rules.progression)
    .flatMap(rules => rules.catalog)
  assert.ok(catalogs.length > 0)
  for (const [kind, schema] of Object.entries(mapping)) {
    assert.deepEqual(
      [...new Set(catalogs.filter(entry => entry.key.kind === kind).map(entry => entry.key.id))].sort(),
      [...schemas[schema].enum].sort(),
      `${kind}: catalog and client vocabulary drift`,
    )
  }
})
