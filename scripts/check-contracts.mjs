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
