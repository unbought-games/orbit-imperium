import {reserveTestPort} from './fixtures/ports.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
mkdirSync('.secrets', {recursive: true, mode: 0o700});
const redact=text=>text.replace(/[0-9a-f]{64}/g,'[redacted]');
const db=`orbit_e2e_${randomBytes(6).toString('hex')}`;
const exec=(cmd,args,env=process.env)=>execFileSync(cmd,args,{env,stdio:'pipe'});
const compose=(...args)=>exec('docker',['compose',...args]);
const passwords=[randomUUID(),randomUUID()],secret=`${process.env.ORBIT_TEST_SECRET_DIR??'.secrets'}/${db}`;
const portLease=await reserveTestPort(process.env.ORBIT_TEST_HTTP_PORT);
const port=portLease.port;
const base=`http://localhost:${port}`;
let server;
try{
 compose('exec','-T','db','createdb','-U','orbit',db);
 writeFileSync(secret,passwords.join('\n'),{mode:0o600});
 const env={...process.env,ORBIT_TEST_SEEDED:"1",DATABASE_URL:`postgres://orbit:${encodeURIComponent(process.env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT??'55432'}/${db}`,ORBIT_SEED_PASSWORD_FILE:secret,ORBIT_BIND:`127.0.0.1:${port}`,ORBIT_ORIGIN:base,ORBIT_TEST_BASE_URL:base,ORBIT_LOCAL_INSECURE:'1',ALPHA_PASSWORD:passwords[0],BETA_PASSWORD:passwords[1],TEST_DB_NAME:db};
 exec('target/debug/orbit',['dev-seed','--universe',randomUUID(),'--at','1000000'],env);
 compose('exec','-T','db','psql','-U','orbit','-d',db,'-c','CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)');
 await portLease.release();
 server=spawn('target/debug/orbit',['serve'],{env,stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health/ready')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 console.log(redact(exec('npx',['playwright','test'],env).toString()));
 console.log('Playwright passed against isolated PostgreSQL and real server.');
}catch(e){console.error(redact(e.stdout?.toString()??'Browser run failed'));console.error(redact(e.stderr?.toString()??''));process.exitCode=1;}
finally{if(server){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}compose('exec','-T','db','dropdb','-U','orbit','--force',db);try{unlinkSync(secret)}catch{}}
