import {cleanupAll} from './fixtures/cleanup.mjs';
import {reserveTestPort} from './fixtures/ports.mjs';
// Isolated prepared states; actual commands and failure paths run through HTTP and PostgreSQL.
import {prepareProgression} from './fixtures/progression.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,createHmac,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
mkdirSync('.secrets', {recursive: true, mode: 0o700});
const db=`orbit_raiding_${randomBytes(6).toString('hex')}`,u=randomUUID();
const portLease=await reserveTestPort(process.env.ORBIT_TEST_RAIDING_PORT);
const port=portLease.port,base=`http://localhost:${port}`;
const password=process.env.ORBIT_DB_PASSWORD || 'orbit';
const url=`postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/`;
const admin=new pg.Client({connectionString:url+'orbit'});await admin.connect();
const accounts=Array.from({length:5},(_,i)=>({name:`player${i+1}`,password:randomUUID()}));
const accountFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.json`,seedFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.seed`;
const env={...process.env,ORBIT_TEST_SEEDED:"1",DATABASE_URL:url+db,ORBIT_MVP_ACCOUNTS_FILE:accountFile,ORBIT_MVP_SEED_FILE:seedFile,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_LOCAL_INSECURE:'1',ORBIT_TEST_BASE_URL:base,ORBIT_RAIDING_E2E:'1',TEST_DB_NAME:db};
delete env.ORBIT_SPEED;delete env.ORBIT_MVP_E2E;
let server,client,at=1_000_000;
const cli=(args,extra={})=>execFileSync('target/debug/orbit',args,{env:{...env,...extra},stdio:'pipe'});
async function stop(signal='SIGINT'){if(server&&server.exitCode===null&&server.signalCode===null){server.kill(signal);await new Promise(r=>server.once('exit',r))}server=null;await portLease.hold()}
async function until(fn,label){for(let i=0;i<300;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,20))}throw Error(`Timed out: ${label}`)}
async function start(){await portLease.release();server=spawn('target/debug/orbit',['serve'],{env,stdio:'ignore'});await until(async()=>{try{return(await fetch(base+'/health/ready')).ok}catch{return false}},'readiness')}
const schema=JSON.parse(readFileSync('contracts/openapi.json','utf8')),ajv=new Ajv({strict:false});addFormats(ajv);
const validators=new Map();function valid(name,value){if(!validators.has(name))validators.set(name,ajv.compile({components:schema.components,$ref:`#/components/schemas/${name}`}));const v=validators.get(name);assert.ok(v(value),`${name}: ${JSON.stringify(v.errors)}`);return value}
try {
 await admin.query(`CREATE DATABASE ${db}`);writeFileSync(accountFile,JSON.stringify(accounts),{mode:0o600});writeFileSync(seedFile,randomBytes(32),{mode:0o600});

 const boot=['mvp-raids-bootstrap','--universe',u,'--at',String(at)];cli(boot);cli(boot);
 client=new pg.Client({connectionString:url+db});await client.connect();
 await client.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)');
 await start();
 const login=async(a)=>{const res=await fetch(base+'/api/v1/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(a)});assert.equal(res.status,200);const session=await res.json();return{session,headers:{Origin:base,'Content-Type':'application/json',Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf}}};
 let a=await login(accounts[0]),b=await login(accounts[1]);
 const post=(auth,path,data,protocol=4)=>fetch(`${base}/api/v${protocol}/universes/${u}/${path}`,{method:'POST',headers:auth.headers,body:JSON.stringify(data)});
 const discover=async(auth)=>valid('BindingCandidate4',await(await fetch(`${base}/api/v4/universes/${u}/binding?request_id=${randomUUID()}`,{headers:auth.headers})).json()).binding;
 let ab=await discover(a),bb=await discover(b),context=binding=>({binding,request_id:randomUUID()});
 const view=async(auth=a,binding=ab)=>{const res=await post(auth,'overview',context(binding));if(res.status===503)return null;assert.equal(res.status,200);return valid('BoundView4',await res.json())};
 const fresh=()=>until(()=>view(),'view');
 const initial=await fresh();let body=initial.bodies[0].id;
 assert.equal(initial.bodies.length,1);assert.equal(Object.keys(initial.bodies[0].levels).length,10);assert.ok(Object.values(initial.bodies[0].levels).every(x=>x===0));assert.ok(initial.research.every(x=>x.level===0));assert.deepEqual(initial.bodies[0].amounts,{metal:'1000000000',crystal:'1000000000',deuterium:'0'});assert.deepEqual(initial.bodies[0].inventories,[]);assert.ok(!('production' in initial.bodies[0]));
 assert.equal((await post(a,'overview',context(ab),2)).status,426);
 assert.equal((await post(b,'overview',context(ab))).status,404);
 assert.equal((await post(a,'overview',context({...ab,epoch:randomUUID()}))).status,409);
 const inspect=async(request)=>{const res=await post(a,'progression-options',{context:context(ab),request});assert.equal(res.status,200);return valid('BoundProgressionOptions4',await res.json())};
 for(const request of [{type:'Upgrade',body,building:'FusionReactor'},{type:'Research',host:body,research:'ImpulseDrive'},{type:'Manufacture',body,item:{kind:'Missile',id:'AntiBallisticMissile'},quantity:'1'}])assert.equal((await inspect(request)).blockers[0].code,'UnavailableContent');
 const receipt=async(id,auth=a)=>{const res=await fetch(`${base}/api/v4/universes/${u}/commands/${id}?epoch=${ab.epoch}`,{headers:auth.headers});assert.equal(res.status,200);return valid('BoundReceipt4',await res.json())};
 const send=async(command,expected='Committed')=>{const gameplay={protocol:4,binding:ab,command_id:randomUUID(),command};const envelope={gameplay,presence:{protocol:4,binding:ab,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:command.type==='World'&&['MarkReportRead','SetReportHidden'].includes(command.action.type)?null:body,cause:'GameplayGesture',paired_command_id:gameplay.command_id}}}};const res=await post(a,'commands',envelope);assert.equal(res.status,202);const r=await until(async()=>{const x=await receipt(envelope.gameplay.command_id);return x.status!=='Pending'&&x},command.type);assert.equal(r.status,expected,JSON.stringify(r));return envelope};
 const advance=async(t)=>{assert.ok(t>=at);at=t;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);return fresh()};
 await stop();await prepareProgression(client,u,[{player:ab.player,research:{ComputerTechnology:2},inventory:{LightFighter:101,SmallCargo:6,EspionageProbe:6}},{player:bb.player,inventory:{LightFighter:7,RocketLauncher:6}}]);await start();
 const buy=async(request)=>{
  const x=await inspect(request);assert.ok(x.terms);assert.deepEqual(x.blockers,[],JSON.stringify(x.blockers));
  const quoted=await post(a,'quotes',{context:context(ab),request});assert.equal(quoted.status,200);
  assert.equal(valid('BoundQuote4',await quoted.json()).terms.terms_hash,x.terms_hash);
  const command={...request,type:{Upgrade:'StartUpgrade',Research:'StartResearch',Manufacture:'StartManufacture'}[request.type],expected_terms_hash:x.terms_hash};
  const envelope=await send(command);await advance(x.estimates.final_due_at);
  await until(async()=>{const v=await view();return v&&v.constructions.length===0&&!v.progression.research_operation&&v.progression.manufacturing.length===0},'completion');
  assert.equal((await post(a,'commands',envelope)).status,202);return envelope;
 };
 const target=(await view(b,bb)).bodies[0],targetBody=target.id,targetCoords=target.coordinates;
 const defender={auth:b,binding:bb,body:targetBody};
 console.log('PASS: prepared two-player state validates through real projections; mission, privacy, atomicity and recovery checks follow.');
 const world=async(query)=>{const res=await post(a,'world',{context:context(ab),...query});assert.equal(res.status,200,await res.clone().text());return valid('BoundWorld4',await res.json()).data};
 const destination=await world({type:'ResolveDestination',selection:{type:'BodyAt',coordinates:targetCoords,kind:'Planet'}});
 const empty={metal:'0',crystal:'0',deuterium:'0'};
 const intent={origin:body,destination,mission:'Attack',ships:[{owner:ab.player,ship_type:'LightFighter',count:'80'},{owner:ab.player,ship_type:'SmallCargo',count:'4'}],cargo:{...empty,metal:'100000000'},speed_percent:100};
 const launch=async(intent)=>{const terms=await world({type:'FleetQuote',intent});const pair=await send({type:'World',action:{type:'LaunchFleet',intent,expected_terms_hash:terms.terms_hash}});return {pair,fleet:(await fresh()).missions.fleets.find(f=>f.intent.mission===intent.mission)}};
 const reportFor=async(fleet,kind='Combat',auth=a,binding=ab)=>{
  const id=(await client.query("SELECT id FROM mission_reports WHERE data->>'fleet'=$1 AND kind=$2",[fleet,kind])).rows[0]?.id;assert.ok(id,`missing ${kind}`);
  const res=await post(auth,`reports/${id}`,context(binding));assert.equal(res.status,200);return valid('BoundReport4',await res.json()).data;
 };
 const spy=await launch({...intent,mission:'Espionage',ships:[{owner:ab.player,ship_type:'EspionageProbe',count:'1'}],cargo:empty});await advance(spy.fleet.due_at);
 const observation=await reportFor(spy.fleet.id,'Espionage');assert.equal(observation.payload.kind,'Espionage');
 for(const f of (await fresh()).missions.fleets)await advance(f.due_at);
 // Refresh defender foreground presence through its normal paired production command.
 const activeDefender=async()=>{const save={auth:a,binding:ab,body};a=defender.auth;ab=defender.binding;body=defender.body;const v=await fresh();await send({type:'SetProduction',body,settings:v.progression.production[0].settings,expected_settings_revision:v.progression.production[0].settings_revision});a=save.auth;ab=save.binding;body=save.body};await activeDefender();
 const v=await fresh();assert.ok(v.capabilities.some(x=>x.capability==='Attack'&&x.enabled));
 assert.throws(()=>cli(['mvp-fleets-bootstrap','--universe',u,'--at',String(at)]));
 const raid=await launch(intent);
 const incoming=await until(()=>view(defender.auth,defender.binding),'defender view');assert.ok(incoming.missions.incoming.some(f=>f.mission==='Attack'));assert.equal(incoming.missions.incoming.find(f=>f.mission==='Attack').ships.visibility,'Total');
 // Defender evacuates its available cargo ship and resources through an ordinary Transport before contact.
 const actor={auth:a,binding:ab,body};a=defender.auth;ab=defender.binding;body=defender.body;
 const escapeTarget=await world({type:'ResolveDestination',selection:{type:'BodyAt',coordinates:v.bodies[0].coordinates,kind:'Planet'}});
 await launch({origin:body,destination:escapeTarget,mission:'Transport',ships:[{owner:ab.player,ship_type:'SmallCargo',count:'1'}],cargo:{metal:'100000000',crystal:'200000000',deuterium:'0'},speed_percent:100});
 a=actor.auth;ab=actor.binding;body=actor.body;
 await advance(raid.fleet.due_at);
 const combat=await reportFor(raid.fleet.id);assert.equal(combat.payload.outcome,'AttackerVictory');assert.ok(!combat.payload.participants.find(p=>p.side==='Defender').units.some(u=>u.item.id==='SmallCargo'));assert.ok(BigInt(combat.payload.loot.metal)+BigInt(combat.payload.loot.crystal)+BigInt(combat.payload.loot.deuterium)>0n);assert.ok(BigInt(combat.payload.debris.metal)+BigInt(combat.payload.debris.crystal)>0n);
 assert.ok(!('resources' in combat.payload));assert.ok(!('queues' in combat.payload));
 const fullDefender=await reportFor(raid.fleet.id,'Combat',defender.auth,defender.binding);assert.ok(!('own_cargo_loss' in fullDefender.payload));assert.ok(!('return_at' in fullDefender.payload));
 const outsider=await login(accounts[2]),ob=await discover(outsider);
 assert.equal((await post(outsider,`reports/${combat.header.id}`,context(ob))).status,404);assert.equal((await post(outsider,`reports/${randomUUID()}`,context(ob))).status,404);
 const evidence=await client.query("SELECT audits FROM world_evidence WHERE input=(SELECT event FROM mission_reports WHERE id=$1)",[combat.header.id]);assert.equal(evidence.rows[0].audits.filter(x=>x.kind==='AttackEvidence').length,1);
 for(const hidden of [true,true,false])await send({type:'World',action:{type:'SetReportHidden',report:combat.header.id,hidden}});
 assert.deepEqual((await client.query("SELECT audits FROM world_evidence WHERE input=(SELECT event FROM mission_reports WHERE id=$1)",[combat.header.id])).rows,evidence.rows);
 let returning=(await fresh()).missions.fleets[0];assert.equal(returning.due_at-raid.fleet.due_at,raid.fleet.duration_ms);assert.equal(combat.payload.return_at,returning.due_at);
 const cargo=returning.cargo;await advance(returning.due_at);assert.equal((await fresh()).missions.fleets.length,0);
 const returned=await reportFor(raid.fleet.id,'Returned');assert.deepEqual(returned.payload.cargo,cargo);
 const debris=await world({type:'ResolveDestination',selection:{type:'DebrisAt',coordinates:targetCoords}});
 const harvest=await launch({...intent,destination:debris,mission:'Harvest',ships:[{owner:ab.player,ship_type:'Recycler',count:'1'}],cargo:empty});await advance(harvest.fleet.due_at);returning=(await fresh()).missions.fleets[0];assert.ok(BigInt(returning.cargo.metal)+BigInt(returning.cargo.crystal)>0n);await advance(returning.due_at);
 // Earned reinvestment uses ordinary manufacture after loot and salvage returned.
 const scoreBefore=BigInt((await fresh()).missions.score_value_micro);await buy({type:'Manufacture',body,item:{kind:'Ship',id:'LightFighter'},quantity:'1'});assert.equal(BigInt((await fresh()).missions.score_value_micro),scoreBefore+4000000000n);
 assert.deepEqual((await reportFor(raid.fleet.id)).payload,combat.payload);
 console.log('PASS: prepared fixture → private spy/attack reports → survivor/loot conservation → harvest → exact score delta.');

 await client.query('CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer)');
 const pairFor=command=>{const gameplay={protocol:4,binding:ab,command_id:randomUUID(),command};return{gameplay,presence:{protocol:4,binding:ab,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:command.type==='World'&&['MarkReportRead','SetReportHidden'].includes(command.action.type)?null:body,cause:'GameplayGesture',paired_command_id:gameplay.command_id}}}}};
 const interruptAt=async(stage,trigger)=>{
  await client.query('SELECT pg_advisory_lock(901322)');await client.query("INSERT INTO orbit_test_fault VALUES($1,'pause',true,0)",[stage]);
  const pending=trigger().catch(()=>null);await until(async()=>Number((await client.query('SELECT seen FROM orbit_test_fault WHERE stage=$1',[stage])).rows[0].seen)>0,stage);
  await stop('SIGKILL');await client.query('SELECT pg_advisory_unlock(901322)');await client.query('DELETE FROM orbit_test_fault');await client.query('UPDATE universe_runtime SET lease_until=0 WHERE claim_input IS NOT NULL');await pending;await start();await fresh();
 };
 for(const side of ['before_commit','after_commit']){
  await activeDefender();const q=await world({type:'FleetQuote',intent});const pair=pairFor({type:'World',action:{type:'LaunchFleet',intent,expected_terms_hash:q.terms_hash}});
  await interruptAt(`${side}:LaunchFleet`,()=>post(a,'commands',pair));await post(a,'commands',pair);await until(async()=>{const r=await receipt(pair.gameplay.command_id);return r.status==='Committed'},'launch recovery');
  const fleet=(await fresh()).missions.fleets[0];
  await interruptAt(`${side}:Arrival`,async()=>{at=fleet.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  const report=await reportFor(fleet.id);assert.equal(report.payload.outcome,'AttackerVictory');
  const e=(await client.query('SELECT audits,deltas FROM world_evidence WHERE input=(SELECT event FROM mission_reports WHERE id=$1)',[report.header.id])).rows;
  assert.equal(e.length,1);assert.equal(e[0].audits.filter(x=>x.kind==='AttackEvidence').length,1);
  returning=(await fresh()).missions.fleets[0];assert.equal(returning.due_at-fleet.due_at,fleet.duration_ms);
  await interruptAt(`${side}:Return`,async()=>{at=returning.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  assert.equal((await fresh()).missions.fleets.length,0);await post(a,'commands',pair);assert.equal((await fresh()).missions.fleets.length,0);
  assert.deepEqual((await reportFor(fleet.id)).payload,report.payload);
  assert.deepEqual((await client.query('SELECT audits,deltas FROM world_evidence WHERE input=(SELECT event FROM mission_reports WHERE id=$1)',[report.header.id])).rows,e);
  const counts=(await client.query("SELECT kind,count(*)::int n FROM mission_reports WHERE data->>'fleet'=$1 GROUP BY kind",[fleet.id])).rows;assert.ok(counts.every(x=>x.n===1));
  console.log(`PASS: SIGKILL ${side} attack launch/contact/loot/score/evidence/reports/return; original IDs yield one outcome and delivery.`);
 }
 // Reload/bootstrap never grants or rotates the five original identities.
 await stop();const before=(await client.query('SELECT data FROM mission_fleets ORDER BY id')).rows;cli(boot);await start();assert.deepEqual((await client.query('SELECT data FROM mission_fleets ORDER BY id')).rows,before);
 // Real browser exercises the prepared world after actual mission transitions; retain historic spy/raid reports and create fresh debris with a normal target manufacture.
 const saved={auth:a,binding:ab,body};a=defender.auth;ab=defender.binding;body=defender.body;await buy({type:'Manufacture',body,item:{kind:'Ship',id:'LightFighter'},quantity:'3'});a=saved.auth;ab=saved.binding;body=saved.body;
 env.ORBIT_RAID_TARGET=JSON.stringify({body:targetBody,coordinates:targetCoords});
 console.log(execFileSync('npx',['playwright','test'],{env,stdio:'pipe'}).toString());
 console.log('PASS: raid acceptance, process recovery and real browser journey.');
} catch(e) {let output=e.stdout?.toString()??'';for(const account of accounts)output=output.replaceAll(account.password,'[redacted]');console.error(output.replace(/orbit_session=[a-zA-Z0-9]+/g,'orbit_session=[redacted]'));console.error(e.message);console.error(e.stack?.split('\n').slice(1,4).join('\n'));process.exitCode=1;}
finally {
 const retain=process.env.ORBIT_RAIDING_RETAIN==='1';
 await cleanupAll([
  () => stop(),
  () => client?.end(),
  () => retain ? console.log(`Retained disposable acceptance database ${db}`) : admin.query(`DROP DATABASE ${db} WITH (FORCE)`),
  () => admin.end(),
  () => portLease.release(),
  ...(!retain ? [accountFile,seedFile].map(file=>()=>{try{unlinkSync(file)}catch(error){if(error.code!=='ENOENT')throw error}}) : []),
 ]);
}
