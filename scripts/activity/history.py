#!/usr/bin/env python3
"""Bounded activity extraction, resumable delivery and exact key reconciliation.

DATABASE_URL and ANALYTICS_SERVER_TOKEN are environment-only secrets.
Export never writes the source database. All output is private by default.
"""
import argparse
from contextlib import closing
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sqlite3
import urllib.request
import urllib.error
import uuid

ACTIONS = ('SetProduction', 'StartDemolition', 'StartResearch', 'CancelResearch',
           'StartManufacture', 'LaunchTransport', 'RecallFleet', 'StartUpgrade',
           'CancelConstruction', 'World.LaunchFleet', 'World.RecallMission')


def envelope(row, policy):
    # A retained admission decision always wins, including explicit refusal.
    saved = row.get('activity_policy')
    if saved is None:
        saved = policy.get('subjects', {}).get(str(row.get('issuer')) + '|' + str(row.get('subject')))
    if not saved or saved.get('reason'):
        return None, (saved or {}).get('reason', 'historical_collection_unknown')
    config = saved['config']
    subject = saved.get('subject') or {
        'namespace': 'oidc_' + hashlib.sha256(row['issuer'].encode()).hexdigest(),
        'id': row['subject'],
    }
    at = int(row['at_ms'])
    return {
        'event_id': row['input_id'], 'property_id': str(uuid.UUID(config['propertyId'])),
        'name': 'committed_activity', 'schema_version': 1, 'producer': 'server',
        'category': 'human_action', 'occurred_at': dt.datetime.fromtimestamp(at / 1000, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'clock': 'game', 'logical_time': str(at), 'subject': subject,
        'context': {'environment': config['environment']},
        'collection': {'profile': 'identified', 'policy_version': config['policyVersion'],
                       'consent': True, 'sample_rate': 1, 'dropped_events': 0},
        'properties': {k: row[k] for k in ('world', 'epoch', 'actor', 'action')},
    }, None


def sql_rows(sql):
    env = dict(os.environ, PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000')
    # libpq reads the connection URI from the environment, never argv.
    env['PGDATABASE'] = env.pop('DATABASE_URL')
    r = subprocess.run(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, capture_output=True, env=env, check=False)
    if r.returncode:
        raise RuntimeError('Read-only extraction failed; source and checkpoint unchanged')
    return [json.loads(line) for line in r.stdout.splitlines() if line]


def atomic(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, sort_keys=True) + '\n')
    temp.replace(path)


def extract(args):
    policy = json.loads(args.policy.read_text())
    scope = {'universe': str(uuid.UUID(args.universe)), 'epoch': str(uuid.UUID(args.epoch)),
             'cutoff_ms': args.cutoff_ms, 'policy_sha256': hashlib.sha256(args.policy.read_bytes()).hexdigest()}
    args.output.mkdir(mode=0o700, parents=True, exist_ok=True)
    checkpoint = args.output / 'checkpoint.json'
    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {'scope': scope, 'cursor': str(uuid.UUID(int=0)), 'pages': 0, 'complete': False}
    if state['scope'] != scope:
        raise ValueError('Scope/policy changed; use a fresh extraction directory')
    if state['complete']:
        return
    for _ in range(args.max_batches):
        rows = sql_rows(f"""SELECT row_to_json(r) FROM (
 SELECT c.input_id::text,c.universe::text AS world,c.epoch::text,c.actor::text,c.at_ms,
 CASE WHEN c.input#>>'{{payload,Command,type}}'='World' THEN 'World.'||(c.input#>>'{{payload,Command,action,type}}') ELSE c.input#>>'{{payload,Command,type}}' END AS action,
 c.activity_policy,o.issuer,o.subject
 FROM commands c LEFT JOIN universe_memberships m ON m.universe=c.universe AND m.player=c.actor
 LEFT JOIN oidc_identity o ON o.account=m.account
 WHERE c.universe='{scope['universe']}'::uuid AND c.epoch='{scope['epoch']}'::uuid
 AND c.input_id>'{state['cursor']}'::uuid AND c.at_ms<{args.cutoff_ms}
 AND c.done AND c.receipt->>'status'='Committed' AND activity_is_meaningful(c.input)
 ORDER BY c.input_id LIMIT {args.batch_size}) r;""")
        facts, gaps = [], []
        for row in rows:
            fact, reason = envelope(row, policy)
            if fact:
                facts.append(fact)
            else:
                gaps.append({'event_id': row['input_id'], 'at_ms': row['at_ms'], 'reason': reason})
        page = {'scope': scope, 'facts': facts, 'gaps': gaps, 'source_rows': len(rows)}
        # Crash before checkpoint rewrites the same numbered page, never appends twice.
        atomic(args.output / f"page-{state['pages']:06d}.json", page)
        state['pages'] += 1
        state['complete'] = len(rows) < args.batch_size
        if rows:
            state['cursor'] = rows[-1]['input_id']
        atomic(checkpoint, state)
        if state['complete']:
            break


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def deliver(args):
    # Memory is bounded by one extraction page and one 100-event ingest batch.
    with closing(sqlite3.connect(args.output / 'delivery.sqlite')) as state:
        state.execute('CREATE TABLE IF NOT EXISTS acked(event_id TEXT PRIMARY KEY,digest TEXT NOT NULL)')
        pending=[];batches=0
        opener=urllib.request.build_opener(NoRedirect())
        def flush():
            request=urllib.request.Request(args.endpoint.rstrip('/')+'/v1/ingest/server',
                data=json.dumps({'events':[f for f,d in pending]}).encode(),
                headers={'Authorization':'Bearer '+os.environ['ANALYTICS_SERVER_TOKEN'],'Content-Type':'application/json'})
            try:
                with opener.open(request,timeout=10) as response:
                    body=response.read(262145)
                    if len(body)>262144: raise RuntimeError('Oversized acknowledgement')
                    results=json.loads(body)['results']
            except urllib.error.HTTPError as error:
                error.close()
                raise RuntimeError('Analytics delivery failed; facts retained') from None
            by_id={r['event_id']:r for r in results}
            if len(by_id)!=len(results) or set(by_id)!={f['event_id'] for f,d in pending}:
                raise RuntimeError('Invalid acknowledgement identities; no checkpoint advance')
            failed=False
            for fact,digest in pending:
                if by_id[fact['event_id']]['status'] in ('accepted','duplicate'):
                    state.execute('INSERT INTO acked VALUES(?,?)',(fact['event_id'],digest))
                else: failed=True
            state.commit()
            if failed: raise RuntimeError('Some facts unacknowledged; retained for investigation/resume')
            pending.clear()
        for path in sorted(args.output.glob('page-*.json')):
            page=json.loads(path.read_text())
            if len(page['facts'])>1000: raise ValueError('Extraction page exceeds bound')
            for fact in page['facts']:
                digest=hashlib.sha256(json.dumps(fact,sort_keys=True).encode()).hexdigest()
                saved=state.execute('SELECT digest FROM acked WHERE event_id=?',(fact['event_id'],)).fetchone()
                if saved:
                    if saved[0]!=digest: raise ValueError('An acknowledged fact changed')
                    continue
                pending.append((fact,digest))
                if len(pending)==100:
                    flush();batches+=1
                    if batches>=args.max_batches: return
        if pending: flush()


def normalized(row):
    if 'properties' in row:
        row = dict(row['properties'], event_id=row['event_id'], at_ms=int(row['logical_time']))
    value={k:row[k] for k in ('world','epoch','actor','action')}
    value['at_ms']=int(row['at_ms'])
    return row['event_id'],json.dumps(value,sort_keys=True)


def add_record(db, table, row):
    try:
        db.execute('INSERT INTO '+table+' VALUES(?,?)',normalized(row))
    except sqlite3.IntegrityError:
        raise ValueError('Duplicate event identity in reconciliation input') from None


def reconciliation_result(db):
    result={'complete':True,'expected':db.execute('SELECT count(*) FROM expected').fetchone()[0],
            'actual':db.execute('SELECT count(*) FROM actual').fetchone()[0]}
    for name,query in [('missing','SELECT e.event_id FROM expected e LEFT JOIN actual a USING(event_id) WHERE a.event_id IS NULL'),
                       ('unexpected','SELECT a.event_id FROM actual a LEFT JOIN expected e USING(event_id) WHERE e.event_id IS NULL'),
                       ('changed','SELECT e.event_id FROM expected e JOIN actual a USING(event_id) WHERE e.value<>a.value')]:
        result[name+'_count']=db.execute('SELECT count(*) FROM ('+query+')').fetchone()[0]
        result[name]=[r[0] for r in db.execute(query+' ORDER BY 1 LIMIT 100')]
    return result


def reconcile(expected, actual):
    # Iterable inputs and disk indexes keep memory independent of historical size.
    with tempfile.TemporaryDirectory() as directory, closing(sqlite3.connect(Path(directory)/'reconcile.sqlite')) as db:
        for table,rows in [('expected',expected),('actual',actual)]:
            db.execute('CREATE TABLE '+table+'(event_id TEXT PRIMARY KEY,value TEXT NOT NULL)')
            for row in rows:add_record(db,table,row)
        return reconciliation_result(db)


def reconcile_files(args):
    # Retained immutable exports are bound by path, byte count and mtime. Any
    # replacement/change requires a new checkpoint, never silent continuation.
    with closing(sqlite3.connect(args.checkpoint)) as db:
        db.execute('CREATE TABLE IF NOT EXISTS inputs(name TEXT PRIMARY KEY,identity TEXT NOT NULL,offset INTEGER NOT NULL,complete INTEGER NOT NULL)')
        remaining=args.max_rows
        for table,path in [('expected',args.expected),('actual',args.actual)]:
            stat=path.stat();identity=json.dumps([str(path.resolve()),stat.st_size,stat.st_mtime_ns])
            db.execute('CREATE TABLE IF NOT EXISTS '+table+'(event_id TEXT PRIMARY KEY,value TEXT NOT NULL)')
            saved=db.execute('SELECT identity,offset,complete FROM inputs WHERE name=?',(table,)).fetchone()
            if saved and saved[0]!=identity: raise ValueError('Reconciliation input changed; use a fresh checkpoint')
            if saved and saved[2]:continue
            offset=saved[1] if saved else 0
            with path.open('rb') as source:
                source.seek(offset)
                while remaining:
                    line=source.readline(8193)
                    if not line:break
                    if len(line)>8192:raise ValueError('Oversized reconciliation row')
                    add_record(db,table,json.loads(line));remaining-=1
                offset=source.tell()
            db.execute('INSERT OR REPLACE INTO inputs VALUES(?,?,?,?)',(table,identity,offset,int(offset==stat.st_size)))
            db.commit()
        complete=db.execute('SELECT count(*) FROM inputs WHERE complete=1').fetchone()[0]==2
        if not complete:
            return {'complete':False,'resume_with_same_inputs':True}
        return reconciliation_result(db)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('export');p.add_argument('--universe', required=True);p.add_argument('--epoch', required=True)
    p.add_argument('--cutoff-ms', type=int, required=True);p.add_argument('--policy', type=Path, required=True)
    p.add_argument('--batch-size', type=int, default=500)
    p.add_argument('--max-batches', type=int, default=10);p.add_argument('--output', type=Path, required=True)
    p = sub.add_parser('deliver');p.add_argument('--endpoint', required=True);p.add_argument('--output', type=Path, required=True)
    p.add_argument('--max-batches', type=int, default=100)
    p = sub.add_parser('reconcile');p.add_argument('--expected', type=Path, required=True);p.add_argument('--actual', type=Path, required=True)
    p.add_argument('--checkpoint',type=Path,required=True);p.add_argument('--max-rows',type=int,default=10000)
    args = parser.parse_args()
    if hasattr(args, 'max_batches') and not 1 <= args.max_batches <= 1000:
        parser.error('max-batches must be 1..1000')
    if args.command == 'export':
        if not 1 <= args.batch_size <= 1000: parser.error('batch-size must be 1..1000')
        extract(args)
    elif args.command == 'deliver':
        if not args.endpoint.startswith(('https://', 'http://127.0.0.1:')): parser.error('HTTPS endpoint required')
        deliver(args)
    else:
        if not 1 <= args.max_rows <= 100000: parser.error('max-rows must be 1..100000')
        result = reconcile_files(args)
        print(json.dumps(result, sort_keys=True))
        if not result['complete']: raise SystemExit(2)
        if any(result[k+'_count'] for k in ('missing', 'unexpected', 'changed')): raise SystemExit(1)

if __name__ == '__main__':
    main()
