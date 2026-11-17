#!/usr/bin/env python3
"""Bounded activity extraction, resumable delivery and exact key reconciliation.

DATABASE_URL and ANALYTICS_SERVER_TOKEN are environment-only secrets.
Export never writes the source database. All output is private by default.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import urllib.request
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
    with sqlite3.connect(args.output / 'delivery.sqlite') as state:
        state.execute('CREATE TABLE IF NOT EXISTS acked(event_id TEXT PRIMARY KEY,digest TEXT NOT NULL)')
        pending=[];batches=0
        opener=urllib.request.build_opener(NoRedirect())
        def flush():
            request=urllib.request.Request(args.endpoint.rstrip('/')+'/v1/ingest/server',
                data=json.dumps({'events':[f for f,d in pending]}).encode(),
                headers={'Authorization':'Bearer '+os.environ['ANALYTICS_SERVER_TOKEN'],'Content-Type':'application/json'})
            with opener.open(request,timeout=10) as response:
                body=response.read(262145)
                if len(body)>262144: raise RuntimeError('Oversized acknowledgement')
                results=json.loads(body)['results']
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


def reconcile(expected, actual):
    def normalized(rows):
        result = {}
        for row in rows:
            if 'properties' in row:
                row = dict(row['properties'], event_id=row['event_id'], at_ms=int(row['logical_time']))
            key = row['event_id']
            value = {k: row[k] for k in ('world', 'epoch', 'actor', 'action')}
            value['at_ms'] = int(row['at_ms'])
            if key in result:
                raise ValueError('Duplicate event identity in reconciliation input')
            result[key] = value
        return result
    left, right = normalized(expected), normalized(actual)
    return {'expected': len(left), 'actual': len(right),
            'missing': sorted(left.keys()-right.keys()), 'unexpected': sorted(right.keys()-left.keys()),
            'changed': sorted(k for k in left.keys() & right.keys() if left[k] != right[k])}


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
        result = reconcile([json.loads(x) for x in args.expected.read_text().splitlines()], [json.loads(x) for x in args.actual.read_text().splitlines()])
        print(json.dumps(result, sort_keys=True))
        if any(result[k] for k in ('missing', 'unexpected', 'changed')): raise SystemExit(1)

if __name__ == '__main__':
    main()
