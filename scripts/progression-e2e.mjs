import {cleanupAll} from './fixtures/cleanup.mjs';
import {reserveTestPort} from './fixtures/ports.mjs';
// Isolated prepared states; actual commands and failure paths run through HTTP and PostgreSQL.
import {prepareProgression} from './fixtures/progression.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
mkdirSync('.secrets', {recursive: true, mode: 0o700});
const db=`orbit_progression_${randomBytes(6).toString('hex')}`,u=randomUUID();
const portLease=await reserveTestPort(process.env.ORBIT_TEST_PROGRESSION_PORT);
const port=portLease.port,base=`http://localhost:${port}`;
const password=process.env.ORBIT_DB_PASSWORD || 'orbit';
const url=`postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/`;
const admin=new pg.Client({connectionString:url+'orbit'});await admin.connect();
const accounts=Array.from({length:5},(_,i)=>({name:`player${i+1}`,password:randomUUID()}));
const accountFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.json`,seedFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.seed`;
const env={...process.env,ORBIT_TEST_SEEDED:"1",DATABASE_URL:url+db,ORBIT_MVP_ACCOUNTS_FILE:accountFile,ORBIT_MVP_SEED_FILE:seedFile,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_ALLOW_INSECURE_HTTP:'1',ORBIT_TEST_BASE_URL:base,ORBIT_PROGRESSION_E2E:'1',TEST_DB_NAME:db};
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

 const boot=['mvp-progression-bootstrap','--universe',u,'--at',String(at)];cli(boot);cli(boot);
 client=new pg.Client({connectionString:url+db});await client.connect();
 await client.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)');
 await start();
 const login=async(a)=>{const res=await fetch(base+'/api/v1/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(a)});assert.equal(res.status,200);const session=await res.json();return{session,headers:{Origin:base,'Content-Type':'application/json',Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf}}};
 const a=await login(accounts[0]),b=await login(accounts[1]);
 const post=(auth,path,data,protocol=3)=>fetch(`${base}/api/v${protocol}/universes/${u}/${path}`,{method:'POST',headers:auth.headers,body:JSON.stringify(data)});
 const discover=async(auth)=>valid('BindingCandidate3',await(await fetch(`${base}/api/v3/universes/${u}/binding?request_id=${randomUUID()}`,{headers:auth.headers})).json()).binding;
 const ab=await discover(a),bb=await discover(b),context=binding=>({binding,request_id:randomUUID()});
 const view=async(auth=a,binding=ab)=>{const res=await post(auth,'overview',context(binding));if(res.status===503)return null;assert.equal(res.status,200);return valid('BoundView3',await res.json())};
 const fresh=()=>until(()=>view(),'view');
 const initial=await fresh(),body=initial.bodies[0].id;
 assert.equal(initial.bodies.length,1);assert.equal(Object.keys(initial.bodies[0].levels).length,10);assert.ok(Object.values(initial.bodies[0].levels).every(x=>x===0));assert.ok(initial.research.every(x=>x.level===0));assert.deepEqual(initial.bodies[0].amounts,{metal:'1000000000',crystal:'1000000000',deuterium:'0'});assert.deepEqual(initial.bodies[0].inventories,[]);assert.ok(!('production' in initial.bodies[0]));
 assert.equal((await post(a,'overview',context(ab),2)).status,426);
 assert.equal((await post(b,'overview',context(ab))).status,404);
 assert.equal((await post(a,'overview',context({...ab,epoch:randomUUID()}))).status,409);
 const transport={type:'Transport',origin:body,target:(await view(b,bb)).bodies[0].id,ships:[{owner:ab.player,ship_type:'SmallCargo',count:'1'}],cargo:{metal:'0',crystal:'0',deuterium:'0'},speed_percent:100};
 assert.equal((await post(a,'progression-options',{context:context(ab),request:transport})).status,400);
 const unavailable=await post(a,'quotes',{context:context(ab),request:transport});assert.equal(unavailable.status,422);assert.equal(valid('Problem3',await unavailable.json()).game_code,'UnavailableContent');
 const settings=valid('BoundSettings3',await(await post(a,'settings',context(ab))).json());assert.equal(settings.speed,10);
 const inspect=async(request)=>{const res=await post(a,'progression-options',{context:context(ab),request});assert.equal(res.status,200);return valid('BoundProgressionOptions',await res.json())};
 for(const request of [{type:'Upgrade',body,building:'FusionReactor'},{type:'Research',host:body,research:'ImpulseDrive'},{type:'Manufacture',body,item:{kind:'Missile',id:'AntiBallisticMissile'},quantity:'1'}])assert.equal((await inspect(request)).blockers[0].code,'UnavailableContent');
 const receipt=async(id,auth=a)=>{const res=await fetch(`${base}/api/v3/universes/${u}/commands/${id}?epoch=${ab.epoch}`,{headers:auth.headers});assert.equal(res.status,200);return valid('BoundReceipt3',await res.json())};
 const send=async(command,expected='Committed')=>{const envelope={protocol:3,binding:ab,command_id:randomUUID(),command};const res=await post(a,'commands',envelope);assert.equal(res.status,202);const r=await until(async()=>{const x=await receipt(envelope.command_id);return x.status!=='Pending'&&x},command.type);assert.equal(r.status,expected,JSON.stringify(r));return envelope};
 const advance=async(t)=>{assert.ok(t>=at);at=t;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);return fresh()};
 await stop();await prepareProgression(client,u,[{player:ab.player}]);await start();
 const prepared=await fresh();assert.equal(prepared.bodies[0].inventories.length,6);
 console.log('PASS: prepared progression state validates through the real server; quote, queue, cancellation, privacy and recovery checks follow.');
 console.log(execFileSync('npx',['playwright','test'],{env,stdio:'pipe'}).toString());
 at=Number((await client.query('SELECT at_ms FROM orbit_test_clock')).rows[0].at_ms);
 // Mid-batch crash, durable receipt and output prefix; unchanged clock makes comparison exact.
 const request={type:'Manufacture',body,item:{kind:'Defense',id:'RocketLauncher'},quantity:'3'},x=await inspect(request);
 const e=await send({...request,type:'StartManufacture',expected_terms_hash:x.terms_hash});
 const batch=(await fresh()).progression.manufacturing[0];await advance(batch.next_due_at);
 const before=await until(async()=>{const v=await view();return v?.progression.manufacturing[0]?.completed_prefix==='1'&&v},'first unit');
 const rows=async()=>(await client.query("SELECT jsonb_build_object('bodies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM bodies x),'inventory',(SELECT jsonb_agg(to_jsonb(x) ORDER BY body,item::text) FROM inventories x),'batches',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM manufacturing_batches x),'research',(SELECT jsonb_agg(to_jsonb(x) ORDER BY owner,research) FROM research_levels x),'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY command_id) FROM commands x)) state")).rows[0].state;
 const snapshot=await rows();await stop('SIGKILL');await start();assert.deepEqual(await rows(),snapshot);
 assert.equal((await receipt(e.command_id)).status,'Committed');assert.equal((await post(a,'commands',e)).status,202);
 const restored=await fresh();assert.deepEqual(restored.bodies,before.bodies);assert.deepEqual(restored.progression,before.progression);
 await advance(batch.final_due_at);const done=await until(async()=>{const v=await view();return v&&v.progression.manufacturing.length===0&&v},'remaining units');
 const count=v=>BigInt(v.bodies[0].inventories.find(z=>z.item.id==='RocketLauncher').count);assert.equal(count(done),count(before)+2n);
 cli(boot);assert.deepEqual((await fresh()).bodies,done.bodies);
 assert.equal((await fetch(`${base}/api/v3/universes/${u}/commands/${e.command_id}?epoch=${ab.epoch}`,{headers:b.headers})).status,404);
 // Kill at both sides of the inventory/prefix/receipt transaction, then resume original work.
 await client.query("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer)");
 for(const stage of ['before_commit','after_commit']) {
  await advance(at+86_400_000);
  const q={type:'Manufacture',body,item:{kind:'Defense',id:'RocketLauncher'},quantity:'2'},t=await inspect(q);
  const envelope=await send({...q,type:'StartManufacture',expected_terms_hash:t.terms_hash});
  const startView=await fresh(),work=startView.progression.manufacturing[0],initialCount=count(startView);
  await client.query('SELECT pg_advisory_lock(901322)');
  await client.query("INSERT INTO orbit_test_fault VALUES($1,'pause',true,0)",[stage]);
  at=work.next_due_at;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);
  await until(async()=>Number((await client.query('SELECT seen FROM orbit_test_fault WHERE stage=$1',[stage])).rows[0].seen)>0,'unit commit fault barrier');
  await stop('SIGKILL');await client.query('SELECT pg_advisory_unlock(901322)');
  await client.query('UPDATE universe_runtime SET lease_until=0 WHERE claim_input IS NOT NULL');
  await start();
  await until(async()=>{const v=await view();return v&&count(v)===initialCount+1n},'exactly one first output after crash');
  assert.equal((await post(a,'commands',envelope)).status,202);
  await advance(work.final_due_at);await until(async()=>{const v=await view();return v&&v.progression.manufacturing.length===0&&count(v)===initialCount+2n},'exactly two total output');
  assert.equal((await receipt(envelope.command_id)).status,'Committed');
  await client.query('DELETE FROM orbit_test_fault');
  console.log(`PASS: progression ${stage} SIGKILL at individual unit completion; original receipt, exact prefix and output.`);
 }
 console.log('PASS: desktop/mobile controls, protocol/privacy/schema checks, SIGKILL mid-batch, exact persisted restart state, original-envelope retry without second payment/output, idempotent bootstrap.');
} catch(e) {
 let output=e.stdout?.toString()??'';for(const a of accounts)output=output.replaceAll(a.password,'[redacted]');console.error(output);console.error(e.message);console.error(e.stack?.split('\n').slice(1,4).join('\n'));process.exitCode=1;
} finally {
 await cleanupAll([
  () => stop(),
  () => client?.end(),
  () => admin.query(`DROP DATABASE ${db} WITH (FORCE)`),
  () => admin.end(),
  () => portLease.release(),
  ...[accountFile,seedFile].map(file=>()=>{try{unlinkSync(file)}catch(error){if(error.code!=='ENOENT')throw error}}),
 ]);
}
