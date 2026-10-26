import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
import {reserveTestPort} from './fixtures/ports.mjs';
mkdirSync('.secrets', {recursive: true, mode: 0o700});
const protocol=4;
const migrationVersions=readdirSync(new URL('../crates/storage-postgres/migrations/',import.meta.url))
 .filter(name=>/^\d+_.*\.sql$/.test(name)).map(name=>Number(name.split('_')[0])).sort((a,b)=>a-b);
const portLease=await reserveTestPort(process.env.ORBIT_TEST_CONTAINER_PORT);
const port=portLease.port;
const base=`http://localhost:${port}`;
const suffix=randomBytes(5).toString('hex'),db=`orbit_container_${suffix}`,name=`orbit-game-${suffix}`,envFile=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${suffix}.env`;
const run=(args)=>execFileSync('docker',args,{stdio:'pipe'});
const compose=(...args)=>run(['compose',...args]);
const password=randomUUID();
const project=JSON.parse(compose('config','--format','json').toString()).name;
const image=process.env.ORBIT_TEST_IMAGE??'orbit-imperium:dev';
const common=['--network',`${project}_default`,'--env-file',envFile];
const ready=async()=>{for(let i=0;i<100;i++){try{if((await fetch(base+'/health/ready')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('container readiness timeout')};
try{
 compose('exec','-T','db','createdb','-U','orbit',db);
 writeFileSync(envFile,`DATABASE_URL=postgres://orbit:${encodeURIComponent(process.env.ORBIT_DB_PASSWORD || 'orbit')}@db:5432/${db}\nORBIT_ORIGIN=${base}\nORBIT_ALLOW_INSECURE_HTTP=1\n`,{mode:0o600});
 run(['run','--rm',...common,image,'db-init']);
 run(['run','--rm',...common,image,'universe','create','--universe',randomUUID()]);
 await portLease.release();
 run(['run','-d','--name',name,...common,'-p',`127.0.0.1:${port}:8080`,image]);


 await ready();
 const empty=compose('exec','-T','db','psql','-U','orbit','-d',db,'-Atc','SELECT count(*) FROM accounts').toString().trim();
 assert.equal(empty,'0','container startup must not create accounts');
 const applied=compose('exec','-T','db','psql','-U','orbit','-d',db,'-Atc','SELECT version FROM _sqlx_migrations ORDER BY version').toString().trim();
 assert.deepEqual(applied?applied.split('\n').map(Number):[],migrationVersions,'container CLI setup must apply every production migration');
 const login=await fetch(base+'/api/v1/registration',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'alpha',password})});if(!login.ok)throw new Error('container login failed');
 const session=await login.json(),u=session.memberships[0].universe,cookie=login.headers.get('set-cookie').split(';')[0];const headers={Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':session.csrf};
 const candidate=await(await fetch(`${base}/api/v${protocol}/universes/${u}/binding?request_id=${randomUUID()}`,{headers})).json();
 const view=await(await fetch(`${base}/api/v${protocol}/universes/${u}/overview`,{method:"POST",headers,body:JSON.stringify({binding:candidate.binding,request_id:randomUUID()})})).json();
 if(!view.capabilities.some(c=>c.capability==='Attack'&&c.enabled))throw new Error('raids capability missing');
 const request={type:'Upgrade',body:view.bodies[0].id,building:'MetalMine'};
 const quote=await(await fetch(`${base}/api/v${protocol}/universes/${u}/quotes`,{method:'POST',headers,body:JSON.stringify({context:{binding:view.binding,request_id:randomUUID()},request})})).json();
 const id=randomUUID();const command={...request,type:'StartUpgrade',expected_terms_hash:quote.terms.terms_hash};const gameplay={command_id:id,binding:view.binding,protocol,command};const envelope={gameplay,presence:{protocol:4,binding:view.binding,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:view.bodies[0].id,cause:'GameplayGesture',paired_command_id:id}}}};const response=await fetch(`${base}/api/v${protocol}/universes/${u}/commands`,{method:'POST',headers,body:JSON.stringify(envelope)});if(response.status!==202)throw new Error('container admission failed');
 run(['restart',name]);await ready();
 // A killed worker retains its 15-second fenced lease; allow that normal recovery window.
 let complete=false,last;for(let i=0;i<300;i++){const receipt=await(await fetch(`${base}/api/v${protocol}/universes/${u}/commands/${id}?epoch=${view.binding.epoch}`,{headers})).json();last=receipt;if(receipt.status==='Committed'){complete=true;break;}await new Promise(r=>setTimeout(r,100))}if(!complete)throw new Error(`container receipt missing after restart: ${last?.status??'unknown'} ${last?.code??''}`);
 console.log('Production container passed: explicit setup, empty account state, signup, readiness, command admission, restart and durable receipt.');
}catch(e){console.error(e.message);process.exitCode=1}finally{await portLease.release();try{run(['rm','-f',name])}catch{}compose('exec','-T','db','dropdb','-U','orbit','--force',db);for(const p of [envFile])try{unlinkSync(p)}catch{}}
