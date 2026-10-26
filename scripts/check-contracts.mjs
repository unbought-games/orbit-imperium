import {execFileSync} from 'node:child_process';
import {readFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const schema=JSON.parse(readFileSync('contracts/openapi.json','utf8'));
const ajv=new Ajv({strict:false});addFormats(ajv);
for(const name of Object.keys(schema.components.schemas))ajv.compile({components:schema.components,$ref:`#/components/schemas/${name}`});
const resource=ajv.compile({components:schema.components,$ref:'#/components/schemas/Resources'});
assert.equal(resource({metal:'9007199254740993',crystal:'0',deuterium:'0'}),true);
for(const metal of ['01','1e6','-1','9223372036854775808'])assert.equal(resource({metal,crystal:'0',deuterium:'0'}),false,`invalid decimal ${metal}`);
const stack=ajv.compile({components:schema.components,$ref:'#/components/schemas/ShipRequest'});
assert.equal(stack({owner:'00000000-0000-4000-8000-000000000001',ship_type:'SmallCargo',count:'0'}),false);
const output='target/contract-check.ts';
try{execFileSync('npx',['openapi-typescript','contracts/openapi.json','-o',output],{stdio:'pipe'});assert.equal(readFileSync(output,'utf8'),readFileSync('apps/web/src/contracts.ts','utf8'),'Generated contract drift: run npm run contracts');}finally{try{unlinkSync(output)}catch{}}
console.log('OpenAPI schemas compile and generated TypeScript has no drift.');

const id='00000000-0000-4000-8000-000000000001';
const context={binding:{account:id,player:id,universe:id,epoch:id},request_id:id};
for(const endpoint of ['quotes','progression-options']) {
 const definition=schema.paths[`/api/v3/universes/{universe}/${endpoint}`].post.requestBody.content['application/json'].schema;
 const request=ajv.compile({components:schema.components,...definition});
 assert.ok(request({context,request:{type:'Manufacture',body:id,item:{kind:'Ship',id:'Recycler'},quantity:'2'}}),`${endpoint} must expose progression requests`);
 assert.equal(request({context,request:{type:'Manufacture',body:id,item:{kind:'Ship',id:'Recycler'},quantity:2}}),false);
}
const problem3=ajv.compile({components:schema.components,$ref:'#/components/schemas/Problem3'});
assert.ok(problem3({type:'about:blank',status:422,code:'GameRejected',game_code:'LabLocked'}));
console.log('Protocol-3 route request bodies and typed rejection schemas verified.');

const ownMission=ajv.compile({components:schema.components,$ref:'#/components/schemas/OwnMission4'});
const activeFleet={id,intent:{origin:id,destination:{type:'Body',id,expected_kind:'Planet',expected_owner:id},mission:'Transport',ships:[{owner:id,ship_type:'SmallCargo',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'},speed_percent:100},origin:{galaxy:1,system:1,position:1},destination:{galaxy:1,system:1,position:2},leg:'Outbound',ships:[{ship_type:'SmallCargo',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'},due_at:2000,launched_at:1000,duration_ms:1000,paid_fuel:'1000000',can_recall:true};
assert.ok(ownMission(activeFleet));assert.ok(ownMission({...activeFleet,leg:'Returning',can_recall:false}));
for(const leg of ['Returned','Destroyed'])assert.equal(ownMission({...activeFleet,leg}),false,'Own mission projection must contain only occupied fleet slots');
console.log('Protocol-4 active-fleet projection excludes terminal legs.');

const bootstrap=ajv.compile({components:schema.components,$ref:'#/components/schemas/Bootstrap'});
const guest={version:1,signup_enabled:true,result:{status:'anonymous'}};
assert.ok(bootstrap(guest));
assert.ok(bootstrap({...guest,result:{status:'unavailable',code:'Unavailable'}}));
const bootstrapSession={account:id,csrf:'csrf',expires_at:1000,memberships:[]};
for(const game of [{status:'no_membership'},{status:'unavailable',code:'Unavailable'}])
 assert.ok(bootstrap({...guest,result:{status:'authenticated',session:bootstrapSession,game}}));
for(const invalid of [{...guest,version:2},{...guest,result:{status:'unknown'}},{...guest,token:'private'},{...guest,result:{status:'authenticated',session:bootstrapSession,game:{status:'ready'}}}])assert.equal(bootstrap(invalid),false);
console.log('Bootstrap variants reject unknown versions, private fields, and incomplete snapshots.');

const battleRound = ajv.compile({ components: schema.components, $ref: '#/components/schemas/BattleRound4' });
const roundCounts = { number: 1, start: [], end: [] };
const legacyFire = { shots: '2', raw_attack_ticks: '13000000', shield_removed_ticks: '3000000', hull_removed_ticks: '10000000', explosions: '0' };
const attributedFire = { owner: id, origin: { Fleet: id }, side: 'Attacker', ...legacyFire };
assert.ok(battleRound({ ...roundCounts, ...legacyFire }), 'historical combined reports remain readable');
assert.ok(battleRound({ ...roundCounts, fire: [attributedFire] }), 'new reports record fire by shooter');
assert.equal(battleRound({ ...roundCounts, ...legacyFire, fire: [attributedFire] }), false, 'do not store duplicate aggregate fire');
assert.equal(battleRound(roundCounts), false, 'rounds require recorded fire');
assert.equal(battleRound({ ...roundCounts, fire: [{ ...attributedFire, shots: '-1' }] }), false);
assert.equal(battleRound({ ...roundCounts, fire: [{ ...attributedFire, side: 'Unknown' }] }), false);
console.log('Combat rounds accept historical totals or attributed fire, never both.');

const espionage = ajv.compile({ components: schema.components, $ref: '#/components/schemas/EspionagePayload4' });
const reportPreview = ajv.compile({ components: schema.components, $ref: '#/components/schemas/ReportPreview4' });
const observed = JSON.parse(readFileSync('contracts/fixtures/espionage-expanded.json', 'utf8'));
for (const name of ['Nova Roma', null, undefined]) {
 const target = { ...observed.target, name };
 if (name === undefined) delete target.name;
 assert.ok(espionage({ ...observed, target }), 'named, unnamed and historical report targets remain valid');
 assert.ok(reportPreview({ kind: 'Espionage', target }), 'report previews accept the recorded planet name');
}
console.log('Espionage target names are compatible with historical reports and previews.');

const combatPayload = ajv.compile({ components: schema.components, $ref: '#/components/schemas/CombatPayload4' });
const battle = { kind: 'Combat', at: 1000, target: { galaxy: 1, system: 2, position: 3 }, outcome: 'Draw', participants: [], rounds: [], survivors: [], gross_losses: [], recovered: [], debris: { metal: '0', crystal: '0', deuterium: '0' }, loot: { metal: '0', crystal: '0', deuterium: '0' } };
for (const identity of [{}, { target_name: null }, { target_name: 'Nova Roma', target_kind: 'Planet' }, { target_name: 'Luna', target_kind: 'Moon' }]) {
 assert.ok(combatPayload({ ...battle, ...identity }), 'combat snapshots retain legacy compatibility');
 assert.ok(reportPreview({ kind: 'Combat', target: battle.target, ...identity }));
}
assert.equal(combatPayload({ ...battle, target_name: 42 }), false);
assert.equal(combatPayload({ ...battle, target_kind: 'Unknown' }), false);
assert.equal(reportPreview({ kind: 'ContactLost', target: battle.target, target_name: 'Hidden' }), false);
assert.ok(espionage({ ...observed, target: { ...observed.target, kind: 'Moon', name: 'Luna' } }));
console.log('Combat body identity is optional for legacy payloads and absent from restricted previews.');

for (const [path, operations] of Object.entries(schema.paths)) {
 if (!path.includes('/universes/')) continue;
 for (const method of ['get','post','put','patch','delete']) {
  const operation=operations[method]; if(!operation)continue;
  assert.ok(['retired','recovery-or-metadata','admission','tactical-or-quote','social-or-status','profile-or-tactical','caller-supplied-simulation','public','free-observation'].includes(operation['x-bot-category']),`${method} ${path} requires an explicit bot accounting classification`);
 }
}
console.log('Every versioned universe operation has a bot accounting classification.');
