// Explicit-only S1 acceptance: actual CLI, HTTP server, worker and disposable DB.
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import {reserveTestPort} from './fixtures/ports.mjs';
import {cleanupAll} from './fixtures/cleanup.mjs';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const fingerprint=createHash('sha256').update(execFileSync('git',['diff','--binary','HEAD']));
for(const path of execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).sort())fingerprint.update(path).update(readFileSync(path));
console.log(`tested_base_revision=${revision} worktree_sha256=${fingerprint.digest('hex')}`);
const phase=label=>console.log(`phase=${label} elapsed_ms=${Math.round(performance.now()-started)}`);
const started=performance.now(),db=`orbit_bots_${randomBytes(6).toString('hex')}`,u=randomUUID();
const temp=mkdtempSync(join(tmpdir(),'orbit-bots-')),lease=await reserveTestPort();
const base=`http://localhost:${lease.port}`;
const url=`postgres://orbit:${encodeURIComponent(process.env.ORBIT_DB_PASSWORD||'orbit')}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??55432}/`;
const admin=new pg.Client({connectionString:url+'orbit'});await admin.connect();
const env={...process.env,DATABASE_URL:url+db,ORBIT_BIND:`127.0.0.1:${lease.port}`,ORBIT_ORIGIN:base,ORBIT_ALLOW_INSECURE_HTTP:'1',ORBIT_UNIVERSE_ID:u};
for(const k of ['ORBIT_TEST_SEEDED','ORBIT_ROLE','ORBIT_SPEED','ORBIT_AUTH_MODE'])delete env[k];
const cli=(args,binary='target/debug/orbit')=>execFileSync(binary,args,{env,encoding:'utf8',stdio:'pipe'}).trim();
let server,client,serverLog='';
async function stop(){if(server && server.exitCode===null && server.signalCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}server=null;await lease.hold();}
async function until(fn,label){for(let i=0;i<500;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw Error(`Readiness/assertion timeout: ${label}\n${serverLog}`);}
async function start(binary='target/debug/orbit'){await lease.release();server=spawn(binary,['serve'],{env,stdio:['ignore','pipe','pipe']});server.stdout.on('data',x=>serverLog+=x);server.stderr.on('data',x=>serverLog+=x);await until(async()=>{if(server.exitCode!==null)throw Error(serverLog);try{return(await fetch(base+'/health/ready')).ok;}catch{return false;}},'server ready');}
const context=binding=>({binding,request_id:randomUUID()});
const headers=token=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});
const post=(auth,path,data)=>fetch(`${base}/api/v4/universes/${u}/${path}`,{method:'POST',headers:auth,body:JSON.stringify(data)});
async function json(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
const binding=async(auth)=>(await json(await fetch(`${base}/api/v4/universes/${u}/binding?request_id=${randomUUID()}`,{headers:auth}))).binding;
const status=async(auth)=>json(await fetch(`${base}/api/v4/universes/${u}/bot-status`,{headers:auth}));
const receipt=async(auth,b,id)=>json(await fetch(`${base}/api/v4/universes/${u}/commands/${id}?epoch=${b.epoch}`,{headers:auth}));
async function settled(auth,b,id){return until(async()=>{const r=await receipt(auth,b,id);return r.status!=='Pending'&&r;},'durable receipt');}
try {
 await admin.query(`CREATE DATABASE ${db}`);
 // Real pre-S1 schema/data. Verify old binary was viable before the migration.
 cli(['setup','--universe',u],'target/bots-pre-s1');await start('target/bots-pre-s1');
 const oldSignup=await fetch(base+'/api/v1/registration',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'pre-upgrade-human',password:'ordinary-human-password'})});
 const oldSession=await json(oldSignup,201),oldHeaders={Origin:base,'Content-Type':'application/json',Cookie:oldSignup.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':oldSession.csrf};
 const oldBinding=await binding(oldHeaders),oldView=await json(await post(oldHeaders,'overview',context(oldBinding))),oldBody=oldView.bodies[0].id;
 const oldQuote=await json(await post(oldHeaders,'progression-options',{context:context(oldBinding),request:{type:'Upgrade',body:oldBody,building:'MetalMine'}}));
 const oldCommand={protocol:4,binding:oldBinding,command_id:randomUUID(),command:{type:'StartUpgrade',body:oldBody,building:'MetalMine',expected_terms_hash:oldQuote.terms_hash}};
 await json(await post(oldHeaders,'commands',{gameplay:oldCommand,presence:{protocol:4,binding:oldBinding,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:oldBody,cause:'GameplayGesture',paired_command_id:oldCommand.command_id}}}}),202);
 assert.equal((await settled(oldHeaders,oldBinding,oldCommand.command_id)).status,'Committed');
 await stop();phase('pre-s1-accepted-work');
 client=new pg.Client({connectionString:url+db});await client.connect();
 const preserved=(await client.query('SELECT id,epoch,profile_hash FROM universes WHERE id=$1',[u])).rows[0];
 cli(['db-init']);
 assert.deepEqual((await client.query('SELECT id,epoch,profile_hash FROM universes WHERE id=$1',[u])).rows[0],preserved);
 for(const role of ['api','worker','combined']){
  const old=spawnSync('target/bots-pre-s1',['serve'],{env:{...env,ORBIT_ROLE:role},encoding:'utf8',timeout:15000});
  assert.equal(old.error,undefined);assert.notEqual(old.status,0);assert.match(old.stderr,/configuration storage unavailable/);
 }
 phase('migration-and-old-binary-refusal');
 const epochDay=Math.floor(Date.now()/86400000)+1;let at=epochDay*86400000+12*3600000;
 await client.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL)');await client.query('INSERT INTO orbit_test_clock VALUES($1)',[at]);
 const policyFile=join(temp,'policy.json');cli(['universe','config','export','--universe',u,'--out',policyFile]);
 const policy=JSON.parse(readFileSync(policyFile));assert.deepEqual(policy.policy.bots,{version:1,enabled:false,max_active:0,action_units_per_24h:null});
 policy.policy.bots={version:1,enabled:true,max_active:2,action_units_per_24h:3};writeFileSync(policyFile,JSON.stringify(policy));cli(['universe','config','apply','--universe',u,'--file',policyFile]);
 await start();
 const create=name=>JSON.parse(cli(['bots','create','--universe',u,'--name',name,'--sleep-start-utc','00:00']));
 const a=create('harvester'),b=create('sentinel');
 const token=player=>cli(['bots','token','issue','--universe',u,'--player',player]);
 const ah=headers(token(a.player)),bh=headers(token(b.player));
 assert.equal((await receipt(oldHeaders,oldBinding,oldCommand.command_id)).status,'Committed');
 await until(async()=>Number((await client.query("SELECT level FROM building_levels WHERE body=$1 AND building='MetalMine'",[oldBody])).rows[0]?.level)===1,'pre-upgrade paid work preserved');
 phase('provisioning-and-preserved-work');
 assert.deepEqual(await binding(ah),a);assert.deepEqual(await binding(bh),b);
 // A human created at the same clock has the same ordinary starter resources.
 const signup=await fetch(base+'/api/v1/registration',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'human-control',password:'ordinary-human-password'})});
 const humanResponse=signup;
 const hs=await json(humanResponse,201);const hh={Origin:base,'Content-Type':'application/json',Cookie:humanResponse.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':hs.csrf};
 const hb=await binding(hh);
 const av=await json(await post(ah,'overview',context(a))),hv=await json(await post(hh,'overview',context(hb)));
 assert.deepEqual(av.bodies[0].amounts,hv.bodies[0].amounts);assert.deepEqual(av.bodies[0].levels,hv.bodies[0].levels);
 const profiles=await json(await fetch(`${base}/api/v1/universes/${u}/player-profiles`,{method:'POST',headers:hh,body:JSON.stringify({context:context(hb),source:{type:'Rankings',players:[a.player,b.player]}})}));
 assert.equal(profiles.players.find(p=>p.player===a.player).kind,'bot');assert.equal(profiles.players.find(p=>p.player===b.player).kind,'bot');
 const quote=async(auth,binding,body)=>json(await post(auth,'progression-options',{context:context(binding),request:{type:'Upgrade',body,building:'MetalMine'}}));
 const aq=await quote(ah,a,av.bodies[0].id),hq=await quote(hh,hb,hv.bodies[0].id);assert.deepEqual({...aq.terms,body:hq.terms.body},hq.terms);
 const envelope=(binding,body,q)=>({protocol:4,binding,command_id:randomUUID(),command:{type:'StartUpgrade',body,building:'MetalMine',expected_terms_hash:q.terms_hash}});
 const ae=envelope(a,av.bodies[0].id,aq);
 // Discard the response body after admission to simulate lost acknowledgement.
 const lost=await post(ah,'machine/commands',ae);assert.equal(lost.status,202);await lost.body.cancel();
 const recovered=await settled(ah,a,ae.command_id);assert.equal(recovered.status,'Committed',JSON.stringify(recovered));
 await json(await post(ah,'machine/commands',ae),202);assert.equal((await status(ah)).allowance_used,1);
 const he=envelope(hb,hv.bodies[0].id,hq);await json(await post(hh,'commands',{gameplay:he,presence:{protocol:4,binding:hb,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:hv.bodies[0].id,cause:'GameplayGesture',paired_command_id:he.command_id}}}}),202);assert.equal((await settled(hh,hb,he.command_id)).status,'Committed');
 const galaxy={context:context(a),type:'Galaxy',galaxy:1,system:1};const observed=await json(await post(ah,'world',galaxy));assert.deepEqual(await json(await post(ah,'world',galaxy)),observed);
 const occupied=av.bodies[0].coordinates;await json(await post(ah,'world',{context:context(a),type:'ResolveDestination',selection:{type:'BodyAt',coordinates:occupied,kind:'Planet'}}));
 assert.equal((await status(ah)).allowance_available,0);assert.equal((await json(await post(ah,'world',{...galaxy,context:context(a)}),403)).code,'BotBudgetExhausted');
 const bv=await json(await post(bh,'overview',context(b))),bq=await quote(bh,b,bv.bodies[0].id),be=envelope(b,bv.bodies[0].id,bq);await json(await post(bh,'machine/commands',be),202);assert.equal((await settled(bh,b,be.command_id)).status,'Committed');
 const presenceBefore=(await client.query("SELECT data->>'last_presence_at' AS at FROM player_policies WHERE id=$1",[b.player])).rows[0].at;
 assert.equal((await post(bh,'bot-retire',{reason:'acceptance retirement'})).status,204);
 at=Math.max(aq.estimates.final_due_at,bq.estimates.final_due_at,hq.estimates.final_due_at);await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);
 await until(async()=>Number((await client.query("SELECT level FROM building_levels WHERE body=$1 AND building='MetalMine'",[bv.bodies[0].id])).rows[0]?.level)===1,'retired construction settlement');
 assert.equal((await json(await post(bh,'overview',context(b)),403)).code,'BotRetired');assert.equal((await receipt(bh,b,be.command_id)).status,'Committed');
 assert.equal((await client.query("SELECT data->>'last_presence_at' AS at FROM player_policies WHERE id=$1",[b.player])).rows[0].at,presenceBefore);
 at=(epochDay+1)*86400000;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);
 assert.equal((await json(await post(ah,'overview',context(a)),403)).code,'BotSleeping');await json(await post(ah,'machine/commands',ae),202);
 at+=8*3600000;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);await json(await post(ah,'overview',context(a)));assert.equal((await status(ah)).allowance_available,0);
 at=(epochDay+1)*86400000+12*3600000;await client.query('UPDATE orbit_test_clock SET at_ms=$1',[at]);assert.equal((await status(ah)).allowance_available,3);
 phase('growth-policy-and-retirement');
 await stop();await start();assert.equal((await status(bh)).state,'retired');assert.equal((await receipt(ah,a,ae.command_id)).status,'Committed');
 const count=(await client.query('SELECT count(*) FROM commands WHERE actor=$1 AND command_id=$2',[a.player,ae.command_id])).rows[0].count;assert.equal(count,'1');
 console.log(`PASS S1: normal grants/costs, public identities, paid tactical reads, retained replay, last-unit exhaustion, sleep boundaries, receipt recovery, terminal retirement, accepted construction settlement, restart, pre-S1 API/worker refusal. scenario_ms=${Math.round(performance.now()-started)}`);
 console.log(`pre_s1_revision=${readFileSync('target/bots-pre-s1-revision','utf8').trim()}`);
} finally {
 await cleanupAll([()=>stop(),()=>client?.end(),()=>admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`),()=>admin.end(),()=>lease.release(),()=>rmSync(temp,{recursive:true,force:true})]);
 console.log(`cleanup=complete database=${db} total_ms=${Math.round(performance.now()-started)}`);
}
