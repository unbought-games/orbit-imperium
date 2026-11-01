import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const contract = JSON.parse(readFileSync('contracts/openapi.json', 'utf8'));
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = name => ajv.compile({ components: contract.components, $ref: `#/components/schemas/${name}` });
const examples = [...readFileSync('docs/operations/public-universe-api.md', 'utf8').matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));

test('public feed documentation matches the anonymous versioned wire contracts', () => {
  assert.equal(examples.length, 2);
  for (const [index, feed] of ['players', 'planets'].entries()) {
    const operation = contract.paths[`/api/public/v1/universes/{universe}/${feed}`].get;
    assert.deepEqual(operation.security, []);
    assert.equal(operation['x-bot-category'], 'public');
    const check = validate(feed === 'players' ? 'PublicPlayers' : 'PublicPlanets');
    const example = examples[index];
    assert.ok(check(example), JSON.stringify(check.errors));
    assert.ok(check({ ...example, [feed]: [] }));
    for (const extra of ['activity_at', 'online', 'vacation', 'resources', 'buildings', 'research', 'ships', 'defenses', 'fleets', 'debris', 'spy_report']) {
      assert.equal(check({ ...example, [extra]: null }), false, extra);
      assert.equal(check({ ...example, [feed]: [{ ...example[feed][0], [extra]: null }] }), false, extra);
    }
    for (const version of [0, 2, '1']) assert.equal(check({ ...example, schema_version: version }), false);
    assert.equal(check({ ...example, sampled_at: '3600000' }), false);
    assert.equal(check({ ...example, epoch: 'not-a-uuid' }), false);
    assert.ok(operation.responses['304']);
    assert.ok(operation.responses['429'].headers['Retry-After']);
  }
});
test('public fields require explicit nulls and exact point strings', () => {
  const player = examples[0].players[0];
  const check = validate('PublicPlayer');
  assert.ok(check({ ...player, points: '0', alliance: null }));
  for (const points of [1, '01', '-1', '1.5', '1e3']) assert.equal(check({ ...player, points }), false);
  const { alliance: _, ...missing } = player;
  assert.equal(check(missing), false);
  assert.equal(check({ ...player, alliance: { ...player.alliance, universe: examples[0].universe } }), false);
  const planet = examples[1].planets[0];
  const { name: __, ...unnamed } = planet;
  assert.equal(validate('PublicPlanet')(unnamed), false);
  assert.ok(validate('PublicPlanet')(planet));
});
