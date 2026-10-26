import {assertStartupRefused} from './fixtures/startup.mjs';
import {cleanupAll} from './fixtures/cleanup.mjs';
import {reserveTestPort} from './fixtures/ports.mjs';
// Disposable acceptance world only. Never targets a retained database.
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
mkdirSync('.secrets', {recursive: true, mode: 0o700});
const db=`orbit_mvp_test_${randomBytes(6).toString('hex')}`,u=randomUUID();
const portLease=await reserveTestPort(process.env.ORBIT_TEST_MVP_PORT);
const port=portLease.port,base=`http://localhost:${port}`;
const password=process.env.ORBIT_DB_PASSWORD || 'orbit';
const connectionString=`postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/`;
const admin=new pg.Client({connectionString:connectionString+'orbit'});await admin.connect();
const accounts=Array.from({length:5},(_,i)=>({name:`player${i+1}`,password:randomUUID()}));
const accountFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.json`,seedFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}.seed`;
const env={...process.env,ORBIT_TEST_SEEDED:"1",DATABASE_URL:connectionString+db,ORBIT_MVP_ACCOUNTS_FILE:accountFile,ORBIT_MVP_SEED_FILE:seedFile,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_ALLOW_INSECURE_HTTP:'1',ORBIT_TEST_BASE_URL:base,ORBIT_MVP_E2E:'1',TEST_DB_NAME:db};
delete env.ORBIT_SPEED;
let server,client;
const cli=(args,extra={})=>execFileSync('target/debug/orbit',args,{env:{...env,...extra},stdio:'pipe'});
const boot=['mvp-bootstrap','--universe',u,'--at','1000000'];
async function stop(signal='SIGINT'){if(server&&server.exitCode===null&&server.signalCode===null){server.kill(signal);await new Promise(r=>server.once('exit',r))}server=null;await portLease.hold()}
async function until(fn,label){for(let i=0;i<200;i++){const value=await fn().catch(()=>null);if(value)return value;await new Promise(r=>setTimeout(r,30))}throw new Error(`Timed out: ${label}`)}
async function start(){await portLease.release();server=spawn('target/debug/orbit',['serve'],{env,stdio:'ignore'});await until(async()=>(await fetch(base+'/health/ready')).ok,'server readiness')}
const schema=JSON.parse(readFileSync('contracts/openapi.json','utf8'));const ajv=new Ajv({strict:false});addFormats(ajv);const settingsSchema=ajv.compile({components:schema.components,$ref:'#/components/schemas/BoundSettings'});
try {
 await admin.query(`CREATE DATABASE ${db}`);
 writeFileSync(accountFile,JSON.stringify(accounts),{mode:0o600});writeFileSync(seedFile,randomBytes(32),{mode:0o600});

 assert.throws(()=>cli([...boot,'--systems','4']));
 assert.throws(()=>cli(['mvp-bootstrap','--universe',u,'--universe',u]));
 for(const bad of ['1','010','+10','10.0',' 10'])assert.throws(()=>cli(boot,{ORBIT_SPEED:bad}));
 assert.throws(()=>cli(boot,{ORBIT_SYSTEMS_PER_GALAXY:'4'}));
 client=new pg.Client({connectionString:connectionString+db});await client.connect();
 assert.deepEqual((await client.query("SELECT to_regclass('public.accounts') AS accounts, to_regclass('public._sqlx_migrations') AS migrations")).rows[0],{accounts:null,migrations:null});
 cli(boot);cli(boot);
 await client.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)');
 await start();
 console.log(execFileSync('npx',['playwright','test'],{env,stdio:'pipe'}).toString());
 const login=async(a)=>{const res=await fetch(base+'/api/v1/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(a)});assert.equal(res.status,200);const session=await res.json();return{session,headers:{Origin:base,'Content-Type':'application/json',Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf}}};
 const a=await login(accounts[0]),b=await login(accounts[1]);
 const post=async(auth,path,data)=>fetch(`${base}/api/v2/universes/${u}/${path}`,{method:'POST',headers:auth.headers,body:JSON.stringify(data)});
 const discover=async(auth)=>(await(await fetch(`${base}/api/v2/universes/${u}/binding?request_id=${randomUUID()}`,{headers:auth.headers})).json()).binding;
 const ab=await discover(a),bb=await discover(b),ctx=binding=>({binding,request_id:randomUUID()});
 const view=async(auth,binding)=>{const r=await post(auth,'overview',ctx(binding));return r.ok?r.json():null};
 const settingsRes=await post(a,'settings',ctx(ab));assert.equal(settingsRes.headers.get('cache-control'),'no-store');const settings=await settingsRes.json();assert.ok(settingsSchema(settings),JSON.stringify(settingsSchema.errors));
 assert.equal(settings.speed,10);assert.equal(settings.galaxies,1);assert.equal(settings.systems_per_galaxy,5);assert.equal(settings.positions_per_system,15);
 assert.equal((await post(b,'settings',ctx(ab))).status,404);assert.equal((await post(b,'overview',ctx(ab))).status,404);
 assert.equal((await post(a,'settings',ctx({...ab,epoch:randomUUID()}))).status,409);
 const av=await view(a,ab),bv=await view(b,bb),origin=av.bodies[0].id,target=bv.bodies[0].id;
 assert.equal((await post(b,'quotes',{context:ctx(bb),request:{type:'Upgrade',body:origin,building:'MetalMine'}})).status,404);
 // Isolated acceptance fixture: inventory/fuel is deliberately absent from actual bootstrap.
 await stop();
 await client.query(`INSERT INTO inventories(body,owner,item,count) VALUES($1,$2,'{"kind":"Ship","id":"SmallCargo"}',2)`,[origin,ab.player]);
 await client.query(`UPDATE bodies SET amounts=jsonb_set(amounts,'{deuterium}','100000000') WHERE id=$1`,[origin]);
 await start();
 const request={type:'Transport',origin,target,ships:[{owner:ab.player,ship_type:'SmallCargo',count:'2'}],cargo:{metal:'10000000',crystal:'0',deuterium:'0'},speed_percent:100};
 const quote=await(await post(a,'quotes',{context:ctx(ab),request})).json();assert.ok(quote.terms.duration>0);
 const command_id=randomUUID(),command={...request,type:'LaunchTransport',expected_terms_hash:quote.terms.terms_hash};
 const envelope={protocol:2,binding:ab,command_id,command};
 assert.equal((await post(b,'commands',envelope)).status,404);
 assert.equal((await post(a,'commands',envelope)).status,202);
 const receipt=async(auth,id)=>fetch(`${base}/api/v2/universes/${u}/commands/${id}?epoch=${ab.epoch}`,{headers:auth.headers});
 await until(async()=>{const r=await(await receipt(a,command_id)).json();return r.status==='Committed'&&r},'transport commit');
 assert.equal((await receipt(b,command_id)).status,404);
 const old=await view(a,ab);assert.equal(old.fleets.length,1);
 await stop('SIGKILL');
 // Bind an independent ephemeral port: the held normal port cannot mask a broken config guard.
 const persisted=(await client.query('SELECT epoch,speed,profile_hash FROM universes')).rows;
 const startupSnapshot=async()=>(await client.query(`SELECT jsonb_build_object(
   'universes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM universes x),
   'bodies',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM bodies x),
   'fleets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM fleets x),
   'commands',(SELECT jsonb_agg(to_jsonb(x) ORDER BY command_id) FROM commands x),
   'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM scheduled_events x)
 ) state`)).rows[0].state;
 const beforeRefusal=await startupSnapshot();
 assertStartupRefused(spawnSync('target/debug/orbit',['serve'],{
   env:{...env,ORBIT_SPEED:'1',ORBIT_BIND:'127.0.0.1:0'},encoding:'utf8',timeout:5000,killSignal:'SIGKILL',
 }));
 assert.deepEqual(await startupSnapshot(),beforeRefusal);
 await start();
 const restored=await view(a,ab);assert.deepEqual(restored.binding,ab);assert.equal(restored.fleets[0].due_at,old.fleets[0].due_at);
 assert.equal((await(await receipt(a,command_id)).json()).status,'Committed');
 assert.equal((await post(a,'commands',envelope)).status,202);
 assert.equal((await client.query('SELECT count(*) FROM fleets')).rows[0].count,'1');
 const settingsAfter=await(await post(a,'settings',ctx(ab))).json();assert.deepEqual({...settingsAfter,request_id:settings.request_id},settings);
 await client.query('UPDATE orbit_test_clock SET at_ms=at_ms+1000');
 const recall_id=randomUUID();assert.equal((await post(a,'commands',{protocol:2,binding:ab,command_id:recall_id,command:{type:'RecallFleet',fleet:old.fleets[0].id}})).status,202);
 const returning=await until(async()=>{const v=await view(a,ab);return v?.fleets[0]?.status==='Returning'&&v},'recall');
 await client.query('UPDATE orbit_test_clock SET at_ms=$1',[returning.fleets[0].due_at]);
 const returned=await until(async()=>{const v=await view(a,ab);return v?.fleets.length===0&&v},'return');
 assert.equal(returned.bodies[0].inventories[0].count,'2');assert.equal((await view(b,bb)).reports.length,0);
 // Matching rerun while serving preserves gameplay and session credentials.
 const state=(await client.query('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) state FROM bodies b')).rows[0].state;
 cli(boot);
 assert.deepEqual((await client.query('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) state FROM bodies b')).rows[0].state,state);
 assert.deepEqual((await client.query('SELECT epoch,speed,profile_hash FROM universes')).rows,persisted);
 assert.equal((await client.query('SELECT count(*) FROM bodies')).rows[0].count,'5');
 console.log('PASS: five browser logins, mobile/desktop, construction, bound settings/schema/privacy, fixture transport/recall, SIGKILL restart, retained receipts, no-op bootstrap, rejected conflicting configuration.');
} catch(e) {
 // Child output can contain request data; only Playwright assertion text is printed after redaction.
 let output=e.stdout?.toString()??'';for(const a of accounts)output=output.replaceAll(a.password,'[redacted]');
 console.error(output);console.error(e instanceof assert.AssertionError?e.message:'MVP acceptance failed; inspect the failing assertion/test above.');process.exitCode=1;
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
