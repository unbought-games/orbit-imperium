-- Small deterministic access-path regression fixture. No engine decoding is performed.
INSERT INTO rulesets VALUES ('lookup','lookup','{}');
INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash)
SELECT md5('u'||g)::uuid,md5('e'||g)::uuid,true,1,0,'lookup' FROM generate_series(1,2) g;
INSERT INTO players SELECT md5('p'||g)::uuid,md5('u'||(1+(g-1)/1000))::uuid FROM generate_series(1,2000) g;
INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at)
SELECT md5('b'||g)::uuid,md5('u'||(1+(g-1)/1000))::uuid,md5('p'||g)::uuid,'Planet',1,g,1,200,30,'{}','{}',0 FROM generate_series(1,2000) g;
INSERT INTO manufacturing_batches
SELECT md5('m'||g)::uuid,md5('u'||(1+((g-1)%2000)/1000))::uuid,md5('p'||(1+(g-1)%2000))::uuid,md5('b'||(1+(g-1)%2000))::uuid,1+(g-1)/2000,jsonb_build_object('status',CASE WHEN g<=10000 THEN 'Active' ELSE 'Completed' END,'revision',0) FROM generate_series(1,12000) g;
INSERT INTO constructions SELECT md5('c'||g)::uuid,universe,id,owner,'Active',0,0,'MetalMine',1,'{}','lookup','terms',0,1000,null FROM bodies JOIN generate_series(1,2000) g ON id=md5('b'||g)::uuid;
INSERT INTO debris_fields SELECT universe,id,jsonb_build_object('coordinates',jsonb_build_object('galaxy',1,'system',system,'position',1)) FROM bodies;
INSERT INTO mission_fleets SELECT md5('u'||(1+((g-1)%2000)/1000))::uuid,md5('f'||g)::uuid,md5('p'||(1+(g-1)%2000))::uuid,jsonb_build_object('leg','Outbound','intent',jsonb_build_object('destination',jsonb_build_object('expected_owner',md5('p'||(1+g%2000))::uuid,'coordinates',jsonb_build_object('galaxy',1,'system',g,'position',1)))) FROM generate_series(1,10000) g;
INSERT INTO commands SELECT md5('u'||(1+((g-1)%2000)/1000))::uuid,md5('e'||(1+((g-1)%2000)/1000))::uuid,md5('p'||(1+(g-1)%2000))::uuid,md5('c'||g)::uuid,md5('i'||g)::uuid,'intent',g,g,'{}','{}',true FROM generate_series(1,20000) g;
ANALYZE;
