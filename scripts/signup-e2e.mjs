// Real production binary, fresh disposable database, no account/seed files.
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import {reserveTestPort} from './fixtures/ports.mjs';
import {cleanupAll} from './fixtures/cleanup.mjs';
const db=`orbit_signup_${randomBytes(6).toString('hex')}`;
const password=process.env.ORBIT_DB_PASSWORD || 'orbit';
const connection=`postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/`;
const admin=new pg.Client({connectionString:connection+'orbit'});await admin.connect();
const portLease=await reserveTestPort(process.env.ORBIT_TEST_SIGNUP_PORT);
const peerLease=await reserveTestPort(process.env.ORBIT_TEST_SIGNUP_PEER_PORT);
const port=portLease.port,base=`http://localhost:${port}`;
const env={...process.env,DATABASE_URL:connection+db,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_ALLOW_INSECURE_HTTP:'1',ORBIT_TEST_BASE_URL:base,ORBIT_SIGNUP_E2E:'1'};
delete env.ORBIT_TEST_SEEDED;delete env.ORBIT_UNIVERSE_ID;
for(const key of ['ORBIT_SPEED','ORBIT_GALAXIES','ORBIT_SYSTEMS_PER_GALAXY','ORBIT_POSITIONS_PER_SYSTEM','ORBIT_MAX_PLAYERS','ORBIT_SIGNUP_ENABLED','ORBIT_SIGNUP_PER_MINUTE','ORBIT_COMMANDS_PER_MINUTE'])delete env[key];
const binary=process.env.ORBIT_TEST_SERVER_BINARY??'target/debug/orbit';
const universe=randomUUID(),directory=mkdtempSync(join(tmpdir(),'orbit-signup-')),policyFile=join(directory,'policy.json');
const cli=(args)=>execFileSync(binary,args,{env,encoding:'utf8',stdio:'pipe'});
let server,client,twin;
async function stop(){if(server&&server.exitCode===null&&server.signalCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r))}server=null;await portLease.hold();}
async function start(extra={}){await portLease.release();server=spawn(process.env.ORBIT_TEST_SERVER_BINARY??'target/debug/orbit',['serve'],{env:{...env,...extra},stdio:'pipe'});for(let i=0;i<200;i++){if(server.exitCode!==null)throw Error('Server failed to start');try{if((await fetch(base+'/health/ready')).ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw Error('readiness timeout');}
const signup=(name)=>fetch(base+'/api/v1/registration',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name,password:'p'})});
try{
 await admin.query(`CREATE DATABASE ${db}`);
 cli(['db-init']);
 const created=JSON.parse(cli(['universe','create','--universe',universe,'--max-players','2']));
 assert.equal(created.configuration.immutable.speed,5);
 // Race real starts against the explicitly prepared, account-free universe.
 await peerLease.release();
 twin=spawn(process.env.ORBIT_TEST_SERVER_BINARY??'target/debug/orbit',['serve'],{env:{...env,ORBIT_BIND:`127.0.0.1:${peerLease.port}`},stdio:'pipe'});
 await start();
 let twinReady=false;
 for(let i=0;i<200;i++){
  if(twin.exitCode!==null)throw Error('Concurrent first server failed to start');
  try{if((await fetch(`http://localhost:${peerLease.port}/health/ready`)).ok){twinReady=true;break}}catch{}
  await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(twinReady,'concurrent first start must become ready');
 twin.kill('SIGINT');await new Promise(r=>twin.once('exit',r));twin=null;
 client=new pg.Client({connectionString:connection+db});await client.connect();
 assert.equal((await client.query('SELECT count(*) FROM accounts')).rows[0].count,'0');
 assert.equal((await client.query('SELECT count(*) FROM universes')).rows[0].count,'1');
 const before=(await client.query('SELECT id,epoch,profile_hash FROM universes')).rows;
 console.log(execFileSync('npx',['playwright','test','--output','target/signup-browser'],{env,stdio:'pipe'}).toString());
 assert.equal((await signup('second')).status,201);
 const full=await signup('third');assert.equal(full.status,409);assert.equal((await full.json()).code,'UniverseFull');
 assert.equal((await client.query('SELECT count(*) FROM accounts')).rows[0].count,'2');
 const bodies=(await client.query('SELECT id,owner,checkpoint_at FROM bodies ORDER BY id')).rows;
 cli(['universe','config','export','--universe',universe,'--out',policyFile]);
 const policy=JSON.parse(readFileSync(policyFile));policy.policy.signup_enabled=false;
 writeFileSync(policyFile,JSON.stringify(policy));
 assert.equal(JSON.parse(cli(['universe','config','apply','--universe',universe,'--file',policyFile])).status,'applied');
 assert.deepEqual(await(await fetch(base+'/api/v1/registration')).json(),{enabled:false});
 assert.equal((await signup('closedlive')).status,403);
 await stop();await start();
 assert.deepEqual((await client.query('SELECT id,epoch,profile_hash FROM universes')).rows,before);
 assert.deepEqual((await client.query('SELECT id,owner FROM bodies ORDER BY id')).rows,bodies.map(({id,owner})=>({id,owner})));
 assert.equal((await signup('closed')).status,403);
 assert.deepEqual(await(await fetch(base+'/api/v1/registration')).json(),{enabled:false});
 const login=await fetch(base+'/api/v1/session',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'newplayer',password:'simple-password'})});assert.equal(login.status,200);
 console.log('PASS: explicit production setup, concurrent startup, live policy closure, browser signup/gameplay, duplicate/full/closed signup, restart and retained login.');
}catch(e){console.error(e.stdout?.toString()??e.message);process.exitCode=1;}
finally{await cleanupAll([
 async()=>{if(twin&&twin.exitCode===null&&twin.signalCode===null){twin.kill('SIGINT');await new Promise(r=>twin.once('exit',r))}},
 stop,()=>rmSync(directory,{recursive:true,force:true}),()=>portLease.release(),()=>peerLease.release(),()=>client?.end(),
 ()=>admin.query(`DROP DATABASE ${db} WITH (FORCE)`),()=>admin.end(),
])}
