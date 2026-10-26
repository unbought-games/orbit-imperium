import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {randomUUID, randomBytes} from 'node:crypto';
import {mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'node:net';
import pg from 'pg';

const binary = resolve(process.env.ORBIT_PREVIOUS_SERVER ?? 'target/debug/orbit');
const migrationVersions = readdirSync('crates/storage-postgres/migrations')
  .filter(name => name.endsWith('.sql')).map(name => Number(name.split('_')[0])).sort((a,b) => a-b);
const futureVersion = migrationVersions.at(-1) + 1;
const secret = process.env.ORBIT_DB_PASSWORD || 'orbit';
const directory = mkdtempSync(join(tmpdir(), 'orbit-migrations-'));
const databases = [], clients = [], children = [];
const compose = (...args) => execFileSync('docker', ['compose', ...args], {stdio: 'pipe'});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const safe = text => secret === 'orbit' ? String(text) : String(text).split(secret).join('[redacted]');
async function until(fn, label, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await fn()) return; await pause(25); }
  throw new Error(`Timed out: ${label}`);
}
async function port() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function database() {
  const name = `orbit_migrations_${randomBytes(6).toString('hex')}`;
  compose('exec', '-T', 'db', 'createdb', '-U', 'orbit', name); databases.push(name);
  const url = `postgres://orbit:${encodeURIComponent(secret)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/${name}`;
  const db = new pg.Client({connectionString: url}); await db.connect(); clients.push(db);
  return {db, url};
}
function environment(url, httpPort, overrides = {}) {
  const env = {...process.env};
  for (const name of Object.keys(env)) if (name.startsWith('ORBIT_')) delete env[name];
  return {...env, DATABASE_URL: url, ORBIT_BIND: `127.0.0.1:${httpPort}`, ORBIT_ORIGIN: `http://localhost:${httpPort}`,
    ORBIT_ALLOW_INSECURE_HTTP: '1', ORBIT_TEST_SEEDED: '1', ORBIT_ASSETS: resolve('apps/web/dist'), ...overrides};
}
function launch(env, executable = binary, args = ['serve']) {
  const process = spawn(executable, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
  const child = {process, stderr: '', exited: false}; children.push(child);
  process.stderr.on('data', data => { child.stderr += safe(data); });
  child.done = new Promise(resolve => process.on('exit', (code, signal) => {child.exited = true; resolve({code, signal});}));
  process.on('error', error => {child.stderr += error.message;});
  return child;
}
async function stop(child, signal = 'SIGINT') {
  if (!child.exited) child.process.kill(signal);
  await child.done;
}
async function ready(child, env) {
  await until(async () => {
    if (child.exited) throw new Error(`Server exited before readiness: ${child.stderr}`);
    try { return (await fetch(`${env.ORBIT_ORIGIN}/health/ready`)).ok; } catch { return false; }
  }, 'server readiness');
}
function cli(env, args) { return execFileSync(binary, args, {env, stdio: 'pipe'}); }
async function empty(db) {
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_class WHERE relnamespace='public'::regnamespace")).rows[0].n, 0);
}
const passwords = join(directory, 'players');
writeFileSync(passwords, `${randomUUID()}\n${randomUUID()}`, {mode: 0o600});
const accounts = join(directory, 'accounts.json');
writeFileSync(accounts, JSON.stringify(Array.from({length:5}, (_, n) => ({name:`player${n}`, password:randomUUID()}))), {mode:0o600});
const seed = join(directory, 'seed');writeFileSync(seed, randomBytes(32), {mode:0o600});

async function rollingUpgrade() {
  const {db, url} = await database();
  const universe = randomUUID();
  const oldEnv = environment(url, await port(), {ORBIT_SEED_PASSWORD_FILE:passwords});
  cli(oldEnv,['dev-seed','--universe',universe,'--at','1000000']);
  await db.query('CREATE TABLE orbit_test_clock(at_ms bigint); INSERT INTO orbit_test_clock VALUES(1000000); CREATE TABLE orbit_test_migration_gate(value integer)');
  let old = launch(oldEnv); await ready(old, oldEnv);
  const base = oldEnv.ORBIT_ORIGIN;
  const login = await fetch(`${base}/api/v1/session`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'alpha',password:readFileSync(passwords,'utf8').split('\n')[0]})});
  assert.equal(login.status,200);
  const session = await login.json();
  const headers = {Origin:base,'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
  const api = async (path,body) => {
    let result;
    await until(async () => {
      const response = await fetch(`${base}/api/v2/universes/${universe}/${path}`,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      // A committed snapshot succeeds even while due work is catching up.
      assert.ok(response.ok,`API ${path} returned ${response.status}`);
      result=await response.json();return true;
    }, `API ${path}`);
    return result;
  };
  const binding = (await api(`binding?request_id=${randomUUID()}`)).binding;
  const view = () => api('overview',{binding,request_id:randomUUID()});
  const initial = await view();
  const identity = (await db.query('SELECT id,epoch,profile_hash FROM universes')).rows;
  cli(oldEnv,['runtime','prepare','--universe',universe]);
  cli(oldEnv,['runtime','activate','--universe',universe]);
  assert.equal((await db.query('SELECT executor_mode FROM universe_runtime WHERE universe=$1',[universe])).rows[0].executor_mode,'scoped');
  await db.query('SELECT pg_advisory_lock(901324)');
  const upgraded = resolve(process.env.ORBIT_CURRENT_SERVER ?? 'target/migration-upgrade/debug/orbit');
  const firstEnv = environment(`${url}?application_name=migration-first`,await port());
  const first = launch(firstEnv, upgraded);
  // Serving pools assign workload names, overriding URL application_name.
  // Capture the actual backend at the unique fixture gate, then follow its PID.
  let firstPid, secondPid;
  await until(async()=>{
    if(first.exited)throw new Error(first.stderr);
    firstPid=(await db.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='orbit-control' AND wait_event='PgSleep' AND query LIKE '%901324%'")).rows[0]?.pid;
    return !!firstPid;
  },'first upgrade waiting at transactional barrier');
  const secondEnv = environment(`${url}?application_name=migration-second`,await port());
  const second = launch(secondEnv, upgraded);
  await until(async()=> {
    if(second.exited)throw new Error(second.stderr);
    secondPid=(await db.query("SELECT a.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND a.application_name='orbit-control' AND a.pid<>$1 AND l.locktype='advisory' AND NOT l.granted",[firstPid])).rows[0]?.pid;
    return !!secondPid;
  },'second upgrade waiting for migration lock');
  for(const env of [firstEnv,secondEnv]) await assert.rejects(fetch(`${env.ORBIT_ORIGIN}/health/ready`));
  assert.equal((await fetch(`${base}/health/ready`)).status,204);
  const request={type:'Upgrade',body:initial.bodies[0].id,building:'MetalMine'};
  const quote=await api('quotes',{context:{binding,request_id:randomUUID()},request});
  const commandId=randomUUID();
  await api('commands',{command_id:commandId,binding,protocol:2,command:{...request,type:'StartUpgrade',expected_terms_hash:quote.terms.terms_hash}});
  await until(async()=> (await api(`commands/${commandId}?epoch=${binding.epoch}`)).status==='Committed','old server commits command during migration');
  const due=(await db.query("SELECT due_at FROM constructions WHERE status='Active'")).rows[0].due_at;
  await db.query('UPDATE orbit_test_clock SET at_ms=$1',[due]);
  await until(async()=> (await view()).bodies[0].levels.MetalMine===initial.bodies[0].levels.MetalMine+1,'old scheduler completes construction during migration');
  await stop(first,'SIGKILL');
  await until(async()=> (await db.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid=$1 AND wait_event='PgSleep' AND query LIKE '%901324%') AS waiting",[secondPid])).rows[0].waiting,'second migrator recovers after first is killed');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM _sqlx_migrations')).rows[0].n,migrationVersions.length);
  assert.equal((await db.query("SELECT to_regclass('upgrade_probe') AS probe")).rows[0].probe,null);
  await db.query('SELECT pg_advisory_unlock(901324)');
  await ready(second,secondEnv);
  assert.deepEqual((await db.query('SELECT version FROM _sqlx_migrations ORDER BY version')).rows.map(r=>Number(r.version)),[...migrationVersions,futureVersion]);
  assert.deepEqual((await db.query('SELECT value FROM upgrade_probe')).rows,[{value:42}]);
  assert.deepEqual((await db.query('SELECT id,epoch,profile_hash FROM universes')).rows,identity);
  await stop(old);old=launch(oldEnv);await ready(old,oldEnv);
  assert.equal((await api(`commands/${commandId}?epoch=${binding.epoch}`)).status,'Committed');
  assert.equal((await view()).bodies[0].levels.MetalMine,initial.bodies[0].levels.MetalMine+1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM commands WHERE command_id=$1',[commandId])).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transition_journal')).rows[0].n,2);
  await stop(old);await stop(second);
  console.log('PASS overlapping old/new servers, live reads/writes/scheduling, concurrent upgrade, killed migrator recovery, and older-version restart');
}

try {
  const {db, url} = await database();
  const env = environment(url, await port());
  const child = launch(env); await ready(child, env);
  assert.equal((await fetch(env.ORBIT_ORIGIN)).status, 200);
  assert.deepEqual((await db.query('SELECT version FROM _sqlx_migrations ORDER BY version')).rows.map(r=>Number(r.version)), migrationVersions);
  for (const table of ['accounts', 'universes', 'commands']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  await stop(child);
  const restarted = launch(env); await ready(restarted, env); await stop(restarted);
  const hostnameEnv = {...env, ORBIT_BIND:`localhost:${new URL(env.ORBIT_ORIGIN).port}`};
  const hostnameChild=launch(hostnameEnv);await ready(hostnameChild,hostnameEnv);await stop(hostnameChild);
  console.log('PASS fresh unseeded server startup, repeat startup, and hostname binding');

  const invalid = await database();
  const invalidEnv = environment(invalid.url, await port());
  for (const [args, overrides] of [
    [['unknown'], {}], [['serve', '--unknown'], {}], [['db-init', '--unknown'], {}],
    [['serve'], {ORBIT_BIND:'not-an-address'}], [['serve'], {ORBIT_LOGIN_PER_MINUTE:'invalid'}],
    [['dev-seed','--universe',randomUUID(),'--at','-1'], {ORBIT_SEED_PASSWORD_FILE:passwords}],
  ]) { assert.throws(()=>cli({...invalidEnv,...overrides},args)); await empty(invalid.db); }
  const badAccounts = join(directory, 'invalid-accounts.json');
  writeFileSync(badAccounts, JSON.stringify(Array.from({length:5},()=>({name:'duplicate',password:randomUUID()}))));
  assert.throws(()=>cli({...invalidEnv,ORBIT_MVP_ACCOUNTS_FILE:badAccounts,ORBIT_MVP_SEED_FILE:seed},['mvp-raids-bootstrap','--universe',randomUUID(),'--at',String(Date.now())]));
  await empty(invalid.db);
  console.log('PASS invalid commands/configuration/credentials leave schema untouched');

  for (const command of ['db-init','db-init-progression','db-init-fleets','db-init-raids']) {
    cli(env,[command]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM _sqlx_migrations')).rows[0].n,migrationVersions.length);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
  }
  for (const command of ['dev-seed','mvp-bootstrap','mvp-progression-bootstrap','mvp-fleets-bootstrap','mvp-raids-bootstrap']) {
    const seeded = await database();
    const seedEnv = environment(seeded.url, await port(), {ORBIT_SEED_PASSWORD_FILE:passwords, ORBIT_MVP_ACCOUNTS_FILE:accounts, ORBIT_MVP_SEED_FILE:seed});
    cli(seedEnv,[command,'--universe',randomUUID(),'--at',String(Date.now())]);
    assert.equal((await seeded.db.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,command==='dev-seed'?2:5);
    const world = (await seeded.db.query('SELECT id,epoch,profile_hash FROM universes')).rows;
    const seededChild=launch(seedEnv);await ready(seededChild,seedEnv);await stop(seededChild);
    assert.deepEqual((await seeded.db.query('SELECT id,epoch,profile_hash FROM universes')).rows,world);
  }
  console.log('PASS explicit seed/bootstrap commands prepare fresh databases; aliases do not seed');
  await rollingUpgrade();
} catch (error) {
  console.error(safe(error.message)); process.exitCode=1;
} finally {
  for (const child of children) await stop(child,'SIGKILL');
  for (const client of clients) await client.end();
  for (const name of databases) compose('exec','-T','db','dropdb','-U','orbit','--force',name);
  rmSync(directory,{recursive:true,force:true});
}
