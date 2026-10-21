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
const db=`orbit_missions_${randomBytes(6).toString('hex')}`,u=randomUUID();
const portLease=await reserveTestPort(process.env.ORBIT_TEST_MISSIONS_PORT);
const port=portLease.port,base=`http://localhost:${port}`;
const password=process.env.ORBIT_DB_PASSWORD || 'orbit';
const url=`postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/`;
const admin=new pg.Client({connectionString:url+'orbit'});await admin.connect();
const accounts=Array.from({length:5},(_,i)=>({name:`player${i+1}`,password:randomUUID()}));
const accountFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.json`,seedFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.seed`;
const env={...process.env,ORBIT_TEST_SEEDED:"1",DATABASE_URL:url+db,ORBIT_MVP_ACCOUNTS_FILE:accountFile,ORBIT_MVP_SEED_FILE:seedFile,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_LOCAL_INSECURE:'1',ORBIT_TEST_BASE_URL:base,ORBIT_MISSIONS_E2E:'1',TEST_DB_NAME:db};
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

 const boot=['mvp-fleets-bootstrap','--universe',u,'--at',String(at)];cli(boot);cli(boot);
 client=new pg.Client({connectionString:url+db});await client.connect();
 await client.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)');
 await start();
 const login=async(a)=>{const res=await fetch(base+'/api/v1/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(a)});assert.equal(res.status,200);const session=await res.json();return{session,headers:{Origin:base,'Content-Type':'application/json',Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf}}};
 let a=await login(accounts[0]),b=await login(accounts[1]);
 const post=(auth,path,data,protocol=4)=>fetch(`${base}/api/v${protocol}/universes/${u}/${path}`,{method:'POST',headers:auth.headers,body:JSON.stringify(data)});
 const discover=async(auth)=>valid('BindingCandidate4',await(await fetch(`${base}/api/v4/universes/${u}/binding?request_id=${randomUUID()}`,{headers:auth.headers})).json()).binding;
 let ab=await discover(a),bb=await discover(b),context=binding=>({binding,request_id:randomUUID()});
 const view=async(auth=a,binding=ab)=>{const res=await post(auth,'overview',context(binding));if(res.status===503)return null;assert.equal(res.status,200);return valid('BoundView4',await res.json())};
 // HTTP 200 is a committed snapshot, not a scheduler catch-up barrier.
 // Wait for this fixture's due work before inspecting its resulting projection.
 const fresh=()=>until(async()=>{
  const pending=await client.query('SELECT EXISTS(SELECT 1 FROM scheduled_events WHERE universe=$1 AND at_ms<=$2 AND NOT done AND NOT cancelled) AS pending',[u,at]);
  return !pending.rows[0].pending && await view();
 },'settled view');
 const initial=await fresh();let body=initial.bodies[0].id;
 assert.equal(initial.bodies.length,1);assert.equal(Object.keys(initial.bodies[0].levels).length,10);assert.ok(Object.values(initial.bodies[0].levels).every(x=>x===0));assert.ok(initial.research.every(x=>x.level===0));assert.deepEqual(initial.bodies[0].amounts,{metal:'1000000000',crystal:'1000000000',deuterium:'0'});assert.deepEqual(initial.bodies[0].inventories,[]);assert.ok(!('production' in initial.bodies[0]));
 assert.equal((await post(a,'overview',context(ab),2)).status,426);
 assert.equal((await post(b,'overview',context(ab))).status,404);
 assert.equal((await post(a,'overview',context({...ab,epoch:randomUUID()}))).status,409);
 const inspect=async(request)=>{const res=await post(a,'progression-options',{context:context(ab),request});assert.equal(res.status,200);return valid('BoundProgressionOptions4',await res.json())};
 for(const request of [{type:'Upgrade',body,building:'FusionReactor'},{type:'Research',host:body,research:'ImpulseDrive'},{type:'Manufacture',body,item:{kind:'Missile',id:'AntiBallisticMissile'},quantity:'1'}])assert.equal((await inspect(request)).blockers[0].code,'UnavailableContent');
 const receipt=async(id,auth=a)=>{const res=await fetch(`${base}/api/v4/universes/${u}/commands/${id}?epoch=${ab.epoch}`,{headers:auth.headers});assert.equal(res.status,200);return valid('BoundReceipt4',await res.json())};
 const send=async(command,expected='Committed')=>{const gameplay={protocol:4,binding:ab,command_id:randomUUID(),command};const envelope={gameplay,presence:{protocol:4,binding:ab,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body,cause:'GameplayGesture',paired_command_id:gameplay.command_id}}}};const res=await post(a,'commands',envelope);assert.equal(res.status,202);const r=await until(async()=>{const x=await receipt(envelope.gameplay.command_id);return x.status!=='Pending'&&x},command.type);assert.equal(r.status,expected,JSON.stringify(r));return envelope};
 const advance=async(t)=>{assert.ok(t>=at);at=t;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);return fresh()};
 await stop();await prepareProgression(client,u,[{player:ab.player,research:{ComputerTechnology:2},inventory:{EspionageProbe:101}},{player:bb.player,inventory:{LightFighter:21,EspionageProbe:101}}]);await start();
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
 console.log('PASS: prepared two-player state validates through real projections; mission, privacy, atomicity and recovery checks follow.');
 const world=async(query)=>{const res=await post(a,'world',{context:context(ab),...query});assert.equal(res.status,200,await res.clone().text());return valid('BoundWorld4',await res.json()).data};
 const galaxy=await world({type:'Galaxy',galaxy:1,system:1});assert.equal(galaxy.positions.length,15);
 const destination=await world({type:'ResolveDestination',selection:{type:'BodyAt',coordinates:targetCoords,kind:'Planet'}});
 const intent={origin:body,destination,mission:'Transport',ships:[{owner:ab.player,ship_type:'SmallCargo',count:'1'}],cargo:{metal:'100000000',crystal:'0',deuterium:'0'},speed_percent:100};
 const launch=async(intent)=>{const terms=await world({type:'FleetQuote',intent});const pair=await send({type:'World',action:{type:'LaunchFleet',intent,expected_terms_hash:terms.terms_hash}});return {pair,fleet:(await fresh()).missions.fleets.find(f=>f.intent.mission===intent.mission)}};
 const transport=await launch(intent);await advance(transport.fleet.due_at);assert.equal((await fresh()).missions.fleets[0].leg,'Returning');await advance((await fresh()).missions.fleets[0].due_at);assert.equal((await fresh()).missions.fleets.length,0);
 // Real mission resolution and combat use deterministic detection in this disposable fixture.
 const injectDetection=async(fleet)=>{
  const event=(await client.query("SELECT id FROM scheduled_events WHERE event->>'type'='FleetLegDue' AND event->>'fleet'=$1 AND NOT done ORDER BY sequence LIMIT 1",[fleet.id])).rows[0].id;
  const uuidBytes=x=>Buffer.from(x.replaceAll('-',''),'hex');let injected;
  for(let n=0;n<100;n++){
   const secret=createHash('sha256').update(`slice4-detected-${n}`).digest(),domain=Buffer.from('espionage'),length=Buffer.alloc(2);length.writeUInt16BE(domain.length);
   const key=createHmac('sha256',secret).update(Buffer.concat([Buffer.from('OI-RNG-v1\0'),uuidBytes(u),uuidBytes(ab.epoch),uuidBytes(event),length,domain])).digest();
   const bytes=createHmac('sha256',key).update(Buffer.concat([Buffer.from('block\0'),Buffer.alloc(8)])).digest();
   const value=bytes.readUIntBE(0,3);if(value<Math.floor(16777216/1000001)*1000001&&value%1000001>900000){injected=secret;break}
  }
  assert.ok(injected);await client.query('CREATE TABLE IF NOT EXISTS orbit_test_random(input_id uuid PRIMARY KEY,secret bytea NOT NULL)');await client.query('INSERT INTO orbit_test_random VALUES($1,$2)',[event,injected]);
 };
 let field;
 for(let attempt=0;attempt<4&&!field;attempt++){
  const spy=await launch({...intent,mission:'Espionage',ships:[{owner:ab.player,ship_type:'EspionageProbe',count:'25'}],cargo:{metal:'0',crystal:'0',deuterium:'0'}});
  await injectDetection(spy.fleet);
  await advance(spy.fleet.due_at);
  const map=await world({type:'Galaxy',galaxy:1,system:1});field=map.positions.find(p=>p.coordinates.position===targetCoords.position)?.debris;
  const flights=(await fresh()).missions.fleets;for(const f of flights)await advance(f.due_at);
 }
 assert.ok(field,'actual detected-spy battle created visible debris');
 const reports=async(auth=a,binding=ab)=>{const res=await post(auth,'reports',{context:context(binding),cursor:null,kind:null,limit:100,include_hidden:false});assert.equal(res.status,200);return valid('BoundReports4',await res.json()).data};
 const inbox=await reports();assert.ok(inbox.items.some(x=>x.kind==='Espionage'));assert.ok(inbox.items.some(x=>x.kind==='Combat'));
 const spyReport=inbox.items.find(x=>x.kind==='Espionage');const report=await post(a,`reports/${spyReport.id}`,context(ab));assert.equal(report.status,200);const observed=valid('BoundReport4',await report.json());assert.equal(observed.data.payload.kind,'Espionage');
 assert.equal((await post(b,`reports/${spyReport.id}`,context(bb))).status,404);
 assert.ok((await reports(b,bb)).items.some(x=>x.kind==='SpyContact'));
 const debris=await world({type:'ResolveDestination',selection:{type:'DebrisAt',coordinates:targetCoords}});
 const harvest=await launch({...intent,destination:debris,mission:'Harvest',ships:[{owner:ab.player,ship_type:'Recycler',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'}});
 await advance(harvest.fleet.due_at);const returning=(await fresh()).missions.fleets[0];assert.ok(BigInt(returning.cargo.crystal)>0n);await advance(returning.due_at);
 assert.equal((await fresh()).missions.fleets.length,0);
 const state=(await client.query('SELECT data FROM mission_fleets ORDER BY id')).rows;
 await stop('SIGKILL');await start();assert.deepEqual((await client.query('SELECT data FROM mission_fleets ORDER BY id')).rows,state);
 assert.equal((await post(a,'commands',harvest.pair)).status,202);assert.equal((await fresh()).missions.fleets.length,0);

 await client.query("CREATE TABLE IF NOT EXISTS orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer)");
 const pairFor=command=>{const gameplay={protocol:4,binding:ab,command_id:randomUUID(),command};return{gameplay,presence:{protocol:4,binding:ab,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body,cause:'GameplayGesture',paired_command_id:gameplay.command_id}}}}};
 const interruptAt=async(stage,trigger)=>{
  await client.query('SELECT pg_advisory_lock(901322)');await client.query("INSERT INTO orbit_test_fault VALUES($1,'pause',true,0)",[stage]);
  const pending=trigger().catch(()=>null);
  await until(async()=>Number((await client.query('SELECT seen FROM orbit_test_fault WHERE stage=$1',[stage])).rows[0].seen)>0,stage);
  await stop('SIGKILL');await client.query('SELECT pg_advisory_unlock(901322)');await client.query('DELETE FROM orbit_test_fault');await client.query('UPDATE universe_runtime SET lease_until=0 WHERE claim_input IS NOT NULL');await pending;await start();await fresh();
 };
 for(const stage of ['before_pair_admission','after_pair_admission','before_commit:Presence','after_commit:Presence']){
  const v=await fresh(),settings={...v.progression.production[0].settings,metal_mine:v.progression.production[0].settings.metal_mine===100?50:100};
  const pair=pairFor({type:'SetProduction',body,settings,expected_settings_revision:v.progression.production[0].settings_revision});
  await interruptAt(stage,()=>post(a,'commands',pair));assert.equal((await post(a,'commands',pair)).status,202);
  await until(async()=>{const r=await receipt(pair.gameplay.command_id);return r.status==='Committed'},'paired recovery');
  assert.equal((await fresh()).progression.production[0].settings.metal_mine,settings.metal_mine);
  const presenceAt=(await receipt(pair.presence.command_id)).executed_at;await advance(at+1);await post(a,'commands',pair);assert.equal((await receipt(pair.presence.command_id)).executed_at,presenceAt);
  console.log(`PASS: SIGKILL ${stage}, atomic paired admission and original-ID recovery.`);
 }
 for(const side of ['before_commit','after_commit']){
  const terms=await world({type:'FleetQuote',intent});const pair=pairFor({type:'World',action:{type:'LaunchFleet',intent,expected_terms_hash:terms.terms_hash}});
  const shipCount=v=>BigInt(v.bodies[0].inventories.find(x=>x.item.id==='SmallCargo').count),before=shipCount(await fresh());
  await interruptAt(`${side}:LaunchFleet`,()=>post(a,'commands',pair));await post(a,'commands',pair);await until(async()=>{const r=await receipt(pair.gameplay.command_id);return r.status==='Committed'},'launch recovery');
  let flight=(await fresh()).missions.fleets[0];assert.equal(shipCount(await fresh()),before-1n);
  await interruptAt(`${side}:Arrival`,async()=>{at=flight.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  flight=(await fresh()).missions.fleets[0];assert.equal(flight.leg,'Returning');
  await interruptAt(`${side}:Return`,async()=>{at=flight.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  assert.equal((await fresh()).missions.fleets.length,0);assert.equal(shipCount(await fresh()),before);
  await post(a,'commands',pair);assert.equal((await fresh()).missions.fleets.length,0);
  console.log(`PASS: SIGKILL ${side} dispatch/delivery/report/return; one debit, delivery, returned fleet and original receipt.`);
 }

 for(const side of ['before_commit','after_commit']){
  const spy=await launch({...intent,mission:'Espionage',ships:[{owner:ab.player,ship_type:'EspionageProbe',count:'25'}],cargo:{metal:'0',crystal:'0',deuterium:'0'}});await injectDetection(spy.fleet);
  await interruptAt(`${side}:Arrival`,async()=>{at=spy.fleet.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  const count=await client.query("SELECT kind,count(*)::int n FROM mission_reports WHERE data->>'fleet'=$1 GROUP BY kind",[spy.fleet.id]);assert.ok(count.rows.some(r=>r.kind==='Espionage'&&r.n===1));assert.ok(count.rows.some(r=>r.kind==='Combat'&&r.n===1));
  for(const f of (await fresh()).missions.fleets)await advance(f.due_at);
  const field=await world({type:'ResolveDestination',selection:{type:'DebrisAt',coordinates:targetCoords}});
  const collection=await launch({...intent,destination:field,mission:'Harvest',ships:[{owner:ab.player,ship_type:'Recycler',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'}});
  await interruptAt(`${side}:Arrival`,async()=>{at=collection.fleet.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});
  const returning=(await fresh()).missions.fleets[0];assert.ok(BigInt(returning.cargo.crystal)>0n);
  await interruptAt(`${side}:Return`,async()=>{at=returning.due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at])});assert.equal((await fresh()).missions.fleets.length,0);
  const result=await client.query("SELECT kind,count(*)::int n FROM mission_reports WHERE data->>'fleet'=$1 GROUP BY kind",[collection.fleet.id]);assert.ok(result.rows.some(r=>r.kind==='Harvested'&&r.n===1));assert.ok(result.rows.some(r=>r.kind==='Returned'&&r.n===1));
  console.log(`PASS: SIGKILL ${side} detected combat/report/debris/harvest/return; no reroll, duplicate report or collected cargo.`);
 }

 const raceTerms=await world({type:'FleetQuote',intent});const racePairs=[0,1].map(()=>pairFor({type:'World',action:{type:'LaunchFleet',intent,expected_terms_hash:raceTerms.terms_hash}}));
 await Promise.all(racePairs.map(pair=>post(a,'commands',pair)));
 const outcomes=await until(async()=>{const r=await Promise.all(racePairs.map(pair=>receipt(pair.gameplay.command_id)));return r.every(x=>x.status!=='Pending')&&r},'competing last ship');
 assert.equal(outcomes.filter(x=>x.status==='Committed').length,1);assert.equal(outcomes.filter(x=>x.status==='Rejected'&&x.code==='InsufficientShips').length,1);
 const single=(await fresh()).missions.fleets;assert.equal(single.length,1);await advance(single[0].due_at);await advance((await fresh()).missions.fleets[0].due_at);
 console.log('PASS: concurrent launches cannot spend the last manufactured cargo ship twice.');

 const limited=await launch({...intent,mission:'Espionage',ships:[{owner:ab.player,ship_type:'EspionageProbe',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'}});await advance(limited.fleet.due_at);for(const f of (await fresh()).missions.fleets)await advance(f.due_at);
 const limitedId=(await client.query("SELECT id FROM mission_reports WHERE data->>'fleet'=$1 AND kind='Espionage'",[limited.fleet.id])).rows[0].id;
 const observation=valid('BoundReport4',await(await post(a,`reports/${limitedId}`,context(ab))).json()).data.payload;assert.equal(observation.fleet.visibility,'Unknown');assert.ok(!('value' in observation.fleet));
 const observer={auth:a,binding:ab,body};a=b;ab=bb;body=targetBody;await buy({type:'Upgrade',body,building:'MetalMine'});a=observer.auth;ab=observer.binding;body=observer.body;
 assert.deepEqual(valid('BoundReport4',await(await post(a,`reports/${limitedId}`,context(ab))).json()).data.payload,observation);
 console.log('PASS: unknown tiers omit values server-side; completed target construction cannot rewrite a saved spy observation.');
 console.log(execFileSync('npx',['playwright','test'],{env,stdio:'pipe'}).toString());
 console.log('PASS: prepared two-player fixture, paired commands, transport, real detected-spy combat, recipient reports, battle debris harvest and durable restart/original-pair retry.');
} catch(e) {let output=e.stdout?.toString()??'';for(const account of accounts)output=output.replaceAll(account.password,'[redacted]');console.error(output.replace(/orbit_session=[a-zA-Z0-9]+/g,'orbit_session=[redacted]'));console.error(e.message);console.error(e.stack?.split('\n').filter(line=>line.trimStart().startsWith('at ')).slice(0,4).join('\n'));process.exitCode=1;}
finally {
 const retain=process.env.ORBIT_MISSIONS_RETAIN==='1';
 await cleanupAll([
  () => stop(),
  () => client?.end(),
  () => retain ? console.log(`Retained disposable acceptance database ${db}`) : admin.query(`DROP DATABASE ${db} WITH (FORCE)`),
  () => admin.end(),
  () => portLease.release(),
  ...(!retain ? [accountFile,seedFile].map(file=>()=>{try{unlinkSync(file)}catch(error){if(error.code!=='ENOENT')throw error}}) : []),
 ]);
}
