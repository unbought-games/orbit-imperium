-- Guided colony opening and private orbital encounters.
CREATE TABLE objective_runs (
    id uuid PRIMARY KEY,
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    beneficiary uuid NOT NULL,
    program text NOT NULL,
    data jsonb NOT NULL,
    UNIQUE (universe, epoch, beneficiary, program),
    CHECK (data->>'id' = id::text),
    CHECK (data->>'universe' = universe::text),
    CHECK (data->>'epoch' = epoch::text),
    CHECK (data->>'beneficiary' = beneficiary::text),
    CHECK (data->'program'->>'id' = program)
);
CREATE INDEX objective_runs_owner ON objective_runs(universe, epoch, beneficiary);

CREATE TABLE mission_sites (
    universe uuid NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    epoch uuid NOT NULL,
    id uuid NOT NULL,
    beneficiary uuid NOT NULL,
    issuance_key text NOT NULL,
    data jsonb NOT NULL,
    PRIMARY KEY (universe, id),
    UNIQUE (universe, epoch, beneficiary, issuance_key),
    CHECK (length(issuance_key) BETWEEN 1 AND 160),
    CHECK (jsonb_typeof(data) = 'object'),
    CHECK ((data #>> '{creation,issuance,universe}') IS NOT DISTINCT FROM universe::text),
    CHECK ((data #>> '{creation,issuance,epoch}') IS NOT DISTINCT FROM epoch::text),
    CHECK ((data #>> '{creation,issuance,beneficiary}') IS NOT DISTINCT FROM beneficiary::text),
    CHECK ((data #>> '{creation,issuance,key}') IS NOT DISTINCT FROM issuance_key)
);
CREATE INDEX mission_sites_beneficiary ON mission_sites (universe, epoch, beneficiary, id);

ALTER TABLE universe_runtime ADD COLUMN site_fleets_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE tutorial_preferences (
    universe uuid NOT NULL REFERENCES universes ON DELETE CASCADE,
    epoch uuid NOT NULL,
    player uuid NOT NULL REFERENCES players ON DELETE CASCADE,
    data jsonb NOT NULL,
    PRIMARY KEY(universe,epoch,player)
);

-- Existing empires start with an empty checklist and keep the full interface.
-- No historical credit or resource grants. New signups enroll in application code.
WITH program AS (SELECT $program$
{"id":"colony-opening-v1","version":1,"objectives":[
  {"id":"solar-1","explanation":"Power your colony before starting its mines.","predicate":{"kind":"Building","building":"SolarPlant","minimum":1},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"metal-1","explanation":"Start producing metal to fund your colony.","predicate":{"kind":"Building","building":"MetalMine","minimum":1},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"crystal-1","explanation":"Produce crystal for construction, research, and ships.","predicate":{"kind":"Building","building":"CrystalMine","minimum":1},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"metal-2","explanation":"Increase metal income and see how growing mines use more energy.","predicate":{"kind":"Building","building":"MetalMine","minimum":2},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"solar-2","explanation":"Restore enough power for your growing mines to run at full output.","predicate":{"kind":"Building","building":"SolarPlant","minimum":2},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"production-settings","explanation":"Learn to balance resource output and energy demand. No adjustment required.","predicate":{"kind":"ProductionSettingsReview"},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"crystal-2","explanation":"Use your expanded power supply to increase crystal production.","predicate":{"kind":"Building","building":"CrystalMine","minimum":2},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"solar-3","explanation":"Create power capacity for the next mine upgrades.","predicate":{"kind":"Building","building":"SolarPlant","minimum":3},"reward":{"metal":600000000,"crystal":300000000,"deuterium":0}},
  {"id":"metal-3","explanation":"Turn available power into a stronger metal income.","predicate":{"kind":"Building","building":"MetalMine","minimum":3},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"crystal-3","explanation":"Increase crystal production to support your growing colony.","predicate":{"kind":"Building","building":"CrystalMine","minimum":3},"reward":{"metal":200000000,"crystal":100000000,"deuterium":0}},
  {"id":"metal-4","explanation":"Keep your solar and crystal mine's growing too.","predicate":{"kind":"Building","building":"MetalMine","minimum":4},"reward":{"metal":400000000,"crystal":200000000,"deuterium":0}},
  {"id":"solar-5","explanation":"Build power capacity for your mines and deuterium production.","predicate":{"kind":"Building","building":"SolarPlant","minimum":5},"reward":{"metal":800000000,"crystal":400000000,"deuterium":0}},
  {"id":"deuterium-1","explanation":"Begin producing deuterium for advanced construction and fuel.","predicate":{"kind":"Building","building":"DeuteriumSynthesizer","minimum":1},"reward":{"metal":600000000,"crystal":300000000,"deuterium":600000000}},
  {"id":"deuterium-2","explanation":"Increase fuel production for research and fleet operations.","predicate":{"kind":"Building","building":"DeuteriumSynthesizer","minimum":2},"reward":{"metal":1200000000,"crystal":600000000,"deuterium":200000000}},
  {"id":"crystal-4","explanation":"Complete your level-four production base.","predicate":{"kind":"Building","building":"CrystalMine","minimum":4},"reward":{"metal":400000000,"crystal":200000000,"deuterium":100000000}},
  {"id":"robotics-2","explanation":"Shorten construction times across your homeworld.","predicate":{"kind":"Building","building":"RoboticsFactory","minimum":2},"reward":{"metal":1000000000,"crystal":800000000,"deuterium":300000000}},
  {"id":"deuterium-5","explanation":"Establish a steady fuel supply for regular fleet operations.","predicate":{"kind":"Building","building":"DeuteriumSynthesizer","minimum":5},"reward":{"metal":1000000000,"crystal":800000000,"deuterium":500000000}},
  {"id":"crystal-6","explanation":"Support shipbuilding with a stronger crystal supply.","predicate":{"kind":"Building","building":"CrystalMine","minimum":6},"reward":{"metal":1200000000,"crystal":1200000000,"deuterium":300000000}},
  {"id":"metal-7","explanation":"Produce enough metal to support your colony’s infrastructure.","predicate":{"kind":"Building","building":"MetalMine","minimum":7},"reward":{"metal":3600000000,"crystal":1800000000,"deuterium":400000000}},
  {"id":"solar-9","explanation":"Support your established economy with a larger power supply.","predicate":{"kind":"Building","building":"SolarPlant","minimum":9},"reward":{"metal":4500000000,"crystal":2200000000,"deuterium":300000000}},
  {"id":"lab-2","explanation":"Expand your laboratory to research new technology faster.","predicate":{"kind":"Building","building":"ResearchLab","minimum":2},"reward":{"metal":800000000,"crystal":1200000000,"deuterium":800000000}},
  {"id":"energy-1","explanation":"Unlock the technology needed for combustion-drive research.","predicate":{"kind":"Research","research":"EnergyTechnology","minimum":1},"reward":{"metal":600000000,"crystal":800000000,"deuterium":500000000}},
  {"id":"combustion-1","explanation":"Develop the engine technology needed to build a Light Fighter.","predicate":{"kind":"Research","research":"CombustionDrive","minimum":1},"reward":{"metal":1200000000,"crystal":600000000,"deuterium":300000000}},
  {"id":"shipyard-2","explanation":"Expand your shipyard to build your first ships faster.","predicate":{"kind":"Building","building":"Shipyard","minimum":2},"reward":{"metal":3000000000,"crystal":2000000000,"deuterium":500000000}},
  {"id":"fighter","explanation":"Build your first combat ship for orbital operations.","predicate":{"kind":"Manufacture","ship":"LightFighter","quantity":1},"reward":{"metal":1000000000,"crystal":500000000,"deuterium":200000000}},
  {"id":"contact","explanation":"Send your fleet into its first battle and see the outcome.","predicate":{"kind":"Attack"},"reward":{"metal":500000000,"crystal":500000000,"deuterium":100000000}},
  {"id":"combustion-2","explanation":"Unlock Small Cargo ships and increase the speed of new flights.","predicate":{"kind":"Research","research":"CombustionDrive","minimum":2},"reward":{"metal":1000000000,"crystal":1000000000,"deuterium":300000000}},
  {"id":"cargo","explanation":"Build a transport ship with room for substantially more loot.","predicate":{"kind":"Manufacture","ship":"SmallCargo","quantity":1},"reward":{"metal":0,"crystal":0,"deuterium":100000000}},
  {"id":"loaded","explanation":"Collect stockpile loot with a surviving fighter and cargo fleet.","predicate":{"kind":"RaidLoaded","required_ships":["LightFighter","SmallCargo"]},"reward":{"metal":0,"crystal":0,"deuterium":0}},
  {"id":"haul","explanation":"Bring your returning fleet’s loot safely back to the colony.","predicate":{"kind":"RaidReturn","required_ships":["LightFighter","SmallCargo"]},"reward":{"metal":500000000,"crystal":250000000,"deuterium":0}},
  {"id":"reinvest","explanation":"Turn your returned loot into lasting metal production.","predicate":{"kind":"Reinvest","building":"MetalMine","minimum":9,"after_return":"haul"},"reward":{"metal":0,"crystal":0,"deuterium":0}}
]}
$program$::jsonb AS data), enrollment AS (
    SELECT p.universe, u.epoch, p.id AS player,
           substring(encode(sha256(convert_to(p.id::text || ':objective-run:' || p.universe::text || ':' || u.epoch::text || ':colony-opening-v1', 'UTF8')), 'hex'), 1, 32)::uuid AS id,
           greatest(floor(extract(epoch FROM statement_timestamp()) * 1000)::bigint,
                    r.frontier, r.ordering_floor,
                    coalesce((SELECT max(frontier) FROM execution_scopes WHERE universe=p.universe),0)) AS at_ms
    FROM players p JOIN universes u ON u.id=p.universe
    JOIN universe_runtime r ON r.universe=p.universe
    JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id
)
INSERT INTO objective_runs(id,universe,epoch,beneficiary,program,data)
SELECT e.id,e.universe,e.epoch,e.player,'colony-opening-v1',
       jsonb_build_object('id',e.id,'universe',e.universe,'epoch',e.epoch,'beneficiary',e.player,
           'program',program.data,'enrolled_at',jsonb_build_object('at_ms',e.at_ms,'phase',0,'ordinal','0'),
           'evidence','[]'::jsonb,'receipts','{}'::jsonb)
FROM enrollment e CROSS JOIN program;
INSERT INTO tutorial_preferences(universe,epoch,player,data)
SELECT universe,epoch,beneficiary,'{"beginner":false}'::jsonb FROM objective_runs;

-- Accepted work keeps its input/terms and gains the same reward and private-site
-- dependencies as newly admitted work. The temporary mapping is dropped at commit.
CREATE TEMP TABLE onboarding_scopes ON COMMIT DROP AS
WITH owners AS (
    SELECT r.universe,r.epoch,r.beneficiary AS player,member->'homeworld'->'coordinates' AS coordinates
    FROM objective_runs r JOIN mvp_bootstraps b ON b.universe=r.universe,
         LATERAL jsonb_array_elements(b.manifest->'members') member
    WHERE member->>'player'=r.beneficiary::text
), dependencies AS (
    SELECT universe,player,
           '{"kind":"Location","key":{"galaxy":' || (coordinates->>'galaxy') || ',"system":' || (coordinates->>'system') || ',"position":' || (coordinates->>'position') || '}}' AS key
    FROM owners
    UNION ALL
    SELECT universe,player,
           '{"kind":"Site","key":"' || substring(encode(sha256(convert_to(universe::text || ':mission-site-v1:' ||
               encode(sha256(convert_to('{"beneficiary":"' || player::text || '","epoch":"' || epoch::text || '","key":"colony-opening-v1/' || site || '","universe":"' || universe::text || '"}', 'UTF8')), 'hex'), 'UTF8')), 'hex'), 1, 32)::uuid::text || '"}'
    FROM owners CROSS JOIN (VALUES ('contact'),('cargo')) sites(site)
)
SELECT universe,'{"kind":"Player","key":"' || player::text || '"}' AS player_key,key FROM dependencies;
INSERT INTO execution_scopes(universe,key)
SELECT DISTINCT universe,key FROM onboarding_scopes ON CONFLICT DO NOTHING;
INSERT INTO input_scopes(universe,input_id,scope_key)
SELECT DISTINCT i.universe,i.input_id,d.key
FROM input_scopes i JOIN onboarding_scopes d ON d.universe=i.universe AND d.player_key=i.scope_key
JOIN pending_inputs p ON p.universe=i.universe AND p.input_id=i.input_id
ON CONFLICT DO NOTHING;

-- Invalidate attempts loaded before the migration; their accepted work is retried.
UPDATE execution_scopes SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL;
UPDATE universe_runtime SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL;
UPDATE viewer_heads SET revision=revision+1;
UPDATE world_heads SET revision=revision+1;
