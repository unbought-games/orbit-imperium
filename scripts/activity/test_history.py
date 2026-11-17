import argparse
import http.server
import os
import threading
import urllib.error
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

spec=importlib.util.spec_from_file_location('history',Path(__file__).with_name('history.py'))
history=importlib.util.module_from_spec(spec);spec.loader.exec_module(history)
class HistoryTests(unittest.TestCase):
    def row(self,n=1):
        return {'input_id':str(uuid.UUID(int=n)),'world':str(uuid.UUID(int=10)),'epoch':str(uuid.UUID(int=11)),
                'actor':'player','action':'StartUpgrade','at_ms':1793563200123,'issuer':'https://identity.example','subject':'person','activity_policy':None}
    def policy(self):
        return {'subjects':{'https://identity.example|person':{'config':{'propertyId':str(uuid.UUID(int=12)),'policyVersion':1,'environment':'test'}}}}
    def test_policy_unknown_refusal_and_stable_timestamp_identity(self):
        row=self.row();fact,gap=history.envelope(row,self.policy())
        self.assertIsNone(gap);self.assertEqual(fact['event_id'],row['input_id']);self.assertEqual(fact['logical_time'],'1793563200123')
        self.assertEqual(fact,history.envelope(row,self.policy())[0])
        self.assertEqual(history.envelope(row,{})[1],'historical_collection_unknown')
        row['activity_policy']={'reason':'collection_disabled'}
        self.assertEqual(history.envelope(row,self.policy()),(None,'collection_disabled'))
    def test_bounded_resume_and_policy_change_refusal(self):
        with tempfile.TemporaryDirectory() as name:
            root=Path(name);policy=root/'policy.json';policy.write_text(json.dumps(self.policy()))
            args=argparse.Namespace(policy=policy,universe=str(uuid.UUID(int=10)),epoch=str(uuid.UUID(int=11)),cutoff_ms=1800000000000,output=root/'out',max_batches=1,batch_size=2)
            with patch.object(history,'sql_rows',return_value=[self.row(1),self.row(2)]) as query:
                history.extract(args);self.assertEqual(query.call_count,1)
            state=json.loads((args.output/'checkpoint.json').read_text());self.assertFalse(state['complete']);self.assertEqual(state['cursor'],str(uuid.UUID(int=2)))
            with patch.object(history,'sql_rows',return_value=[self.row(3)]):history.extract(args)
            self.assertTrue(json.loads((args.output/'checkpoint.json').read_text())['complete'])
            self.assertEqual(len(list(args.output.glob('page-*.json'))),2)
            policy.write_text('{}')
            with self.assertRaisesRegex(ValueError,'Scope/policy changed'):history.extract(args)
    def test_reconciliation_detects_missing_extra_changed_and_duplicate(self):
        a=history.envelope(self.row(),self.policy())[0]
        self.assertFalse(history.reconcile([a],[a])['missing'])
        b=history.envelope(self.row(2),self.policy())[0]
        self.assertEqual(history.reconcile([a],[b])['missing'],[a['event_id']])
        b=json.loads(json.dumps(a));b['properties']['action']='StartResearch'
        self.assertEqual(history.reconcile([a],[b])['changed'],[a['event_id']])
        with self.assertRaisesRegex(ValueError,'Duplicate'):history.reconcile([a],[a,a])
    def test_delivery_resumes_after_remote_commit_without_ack_and_bounds_batches(self):
        seen=set();calls=[]
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                events=json.loads(self.rfile.read(int(self.headers['Content-Length'])))['events']
                calls.append(len(events));results=[]
                for event in events:
                    status='duplicate' if event['event_id'] in seen else 'accepted'
                    seen.add(event['event_id']);results.append({'event_id':event['event_id'],'status':status})
                # Destination committed, but the first acknowledgement is lost.
                self.send_response(503 if len(calls)==1 else 200);self.end_headers()
                self.wfile.write(json.dumps({'results':results}).encode())
        with http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler) as server:
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                with tempfile.TemporaryDirectory() as name, patch.dict(os.environ,{'ANALYTICS_SERVER_TOKEN':'synthetic'}):
                    root=Path(name);facts=[history.envelope(self.row(n),self.policy())[0] for n in range(1,206)]
                    (root/'page-000000.json').write_text(json.dumps({'facts':facts}))
                    args=argparse.Namespace(output=root,endpoint='http://127.0.0.1:'+str(server.server_port),max_batches=1)
                    with self.assertRaisesRegex(RuntimeError,'facts retained'):history.deliver(args)
                    for _ in range(4):history.deliver(args)
                    self.assertEqual(calls,[100,100,100,5]);self.assertEqual(len(seen),205)
            finally:
                server.shutdown();thread.join()
if __name__=='__main__':unittest.main()
