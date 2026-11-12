//! Regression: real site sorties conserve stock/cargo and grants across fenced retries.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use sqlx::PgPool;
use std::collections::BTreeSet;
use uuid::Uuid;
enum Work {
    Serial(Claim),
    Scoped(ScopedClaim),
}
impl Work {
    fn input(&self) -> &OrderedInput {
        match self {
            Self::Serial(c) => &c.input,
            Self::Scoped(c) => &c.input,
        }
    }
    async fn load(&self, store: &PgStore) -> ClaimSnapshot {
        match self {
            Self::Serial(c) => store.load_claim(c).await.unwrap(),
            Self::Scoped(c) => store.load_scoped(c).await.unwrap(),
        }
    }
    async fn commit(
        &self,
        store: &PgStore,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        match self {
            Self::Serial(c) => store.commit_claim(c, result).await,
            Self::Scoped(c) => store.commit_scoped(c, result).await,
        }
    }
}
async fn claim(store: &PgStore, u: UniverseId, scoped: bool) -> Option<Work> {
    if scoped {
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .map(Work::Scoped)
    } else {
        store
            .claim_next(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .map(Work::Serial)
    }
}
async fn drain(store: &PgStore, u: UniverseId, scoped: bool) {
    for _ in 0..50 {
        let Some(c) = claim(store, u, scoped).await else {
            return;
        };
        let f = c.load(store).await;
        let result = transition(&f.state, c.input(), &f.rules);
        assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
        assert!(matches!(
            c.commit(store, result).await.unwrap(),
            CommitOutcome::Committed { .. }
        ));
    }
    panic!("unexpected unbounded objective work");
}
fn context(b: Binding) -> QueryContext {
    QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    }
}
fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn program() -> ObjectiveProgram {
    ObjectiveProgram {
        id: "encounter-fixture".into(),
        version: 1,
        objectives: vec![
            ObjectiveDefinition {
                id: "contact".into(),
                explanation: "Real contact".into(),
                predicate: ObjectivePredicate::Attack,
                reward: Resources::all(7 * SCALE),
            },
            ObjectiveDefinition {
                id: "delivery".into(),
                explanation: "Real haul".into(),
                predicate: ObjectivePredicate::RaidReturn {
                    required_ships: BTreeSet::from([ShipType::LightFighter, ShipType::SmallCargo]),
                },
                reward: Resources::all(11 * SCALE),
            },
        ],
    }
}
fn definition() -> SiteDefinition {
    SiteDefinition {
        schema_version: 1,
        id: "fixtures:satellite-cache".into(),
        version: 1,
        placement: SitePlacementPolicy::Orbital,
        access: SiteAccessPolicy::BeneficiaryOnly,
        admission: SiteAdmissionPolicy::OneActiveOperation,
        debris: SiteDebrisPolicy::RetainedSiteLocal,
        initial_stock: Resources::all(200 * SCALE),
        forces: vec![SiteForce {
            item: ManufacturedItem::Ship(ShipType::SolarSatellite),
            count: 1,
        }],
        combat_technology: [0; 3],
    }
}
struct Fixture {
    store: PgStore,
    pool: PgPool,
    b: Binding,
    other: Binding,
    body: BodyId,
    site: SiteId,
    scoped: bool,
}
impl Fixture {
    async fn new(scoped: bool, speed: i32) -> Self {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.set_test_time(1000).await.unwrap();
        let pool = PgPool::connect(&url).await.unwrap();
        let u = UniverseId(Uuid::new_v4());
        let names = [
            format!("pilot-{}", Uuid::new_v4()),
            format!("other-{}", Uuid::new_v4()),
        ];
        let rules =
            Ruleset::from_json(include_bytes!("../../../rules/mvp-v1-solar-satellite.json"))
                .unwrap();
        let mut artifact = rules.artifact.clone();
        artifact.universe = Some(UniverseProfile::signup(1, 100).unwrap());
        let rules = Ruleset::from_artifact(artifact, speed).unwrap();
        let doc: WorldScenario = serde_json::from_value(json!({"version":1,"rules":rules,"edits":[
            {"op":"add-player","user":names[0],"password":"password","planet":"1:50:8"},
            {"op":"add-player","user":names[1],"password":"password","planet":"1:51:8"},
            {"op":"set","user":names[0],"planet":"1:50:8","research":{"CombustionDrive":2,"ComputerTechnology":2},"ships":{"LightFighter":2,"SmallCargo":2},"resources":{"metal":10000,"crystal":10000,"deuterium":10000}},
            {"op":"set","user":names[1],"planet":"1:51:8","resources":{"metal":10000,"crystal":10000,"deuterium":10000}}
        ]})).unwrap();
        store
            .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
            .await
            .unwrap();
        let mut bindings = vec![];
        for name in &names {
            let auth = SessionService::new(store.clone())
                .login(name, "password", None)
                .await
                .unwrap();
            bindings.push(
                store
                    .current_binding(auth.session.account, u)
                    .await
                    .unwrap()
                    .0,
            );
        }
        let b = bindings[0];
        let other = bindings[1];
        sqlx::query("UPDATE universe_runtime SET site_fleets_enabled=false WHERE universe=$1")
            .bind(u.0)
            .execute(&pool)
            .await
            .unwrap();
        let snap = store.bound_world(b).await.unwrap().facts.0;
        assert!(!snap.state.world.as_ref().unwrap().site_fleets_enabled);
        let body = snap.state.world.as_ref().unwrap().homeworlds[&b.player];
        // Trusted ordered issuance/enrollment at a quiescent serial barrier; fleet
        // admission below must declare its own scopes without test-only helpers.
        let id = CommandId(Uuid::new_v4());
        store
            .admit_presence_scoped(CommandEnvelopeV4 {
                protocol: 4,
                binding: b,
                command_id: id,
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::BodyVisit,
                        paired_command_id: None,
                    },
                }),
            })
            .await
            .unwrap();
        let work = claim(&store, u, false).await.unwrap();
        let snap = work.load(&store).await;
        let TransitionResult::Applied(mut change) =
            transition(&snap.state, work.input(), &snap.rules)
        else {
            panic!("fixture presence");
        };
        let world = snap.state.world.as_ref().unwrap();
        let mut sites = world.records.mission_sites.clone();
        let site = issue_mission_site(
            &mut sites,
            SiteIssuanceKey {
                universe: u,
                epoch: b.epoch,
                beneficiary: b.player,
                key: "fixture:flight".into(),
            },
            definition(),
            snap.state.bodies[&body].coordinates,
            work.input(),
            &snap.rules,
            &world.secret,
        )
        .unwrap();
        sites
            .get_mut(&site)
            .unwrap()
            .append(work.input(), 0, SiteEventKind::Disclosed)
            .unwrap();
        attach_mission_sites(&snap.state, work.input(), &snap.rules, &mut change, sites).unwrap();
        enroll_objective_program(
            &snap.state,
            work.input(),
            &snap.rules,
            &mut change,
            b.player,
            program(),
        )
        .unwrap();
        work.commit(&store, TransitionResult::Applied(change))
            .await
            .unwrap();
        sqlx::query("UPDATE universe_runtime SET site_fleets_enabled=true WHERE universe=$1")
            .bind(u.0)
            .execute(&pool)
            .await
            .unwrap();
        if scoped {
            store.prepare_scoped_runtime(u, 100).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        Self {
            store,
            pool,
            b,
            other,
            body,
            site,
            scoped,
        }
    }
    async fn snap(&self) -> QuoteSnapshot {
        self.store.bound_world(self.b).await.unwrap().facts.0
    }
    async fn site(&self) -> MissionSite {
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT data FROM mission_sites WHERE universe=$1 AND id=$2")
                .bind(self.b.universe.0)
                .bind(self.site.0)
                .fetch_one(&self.pool)
                .await
                .unwrap();
        serde_json::from_value(value).unwrap()
    }
    async fn intent(&self) -> FleetIntent {
        FleetIntent {
            attack_group: None,
            hold_hours: None,
            origin: self.body,
            destination: MissionDestination::Site {
                selection: SiteSelection {
                    id: self.site,
                    expected_revision: self.site().await.revision(),
                },
            },
            mission: Mission::Attack,
            ships: vec![
                ManifestStack {
                    owner: self.b.player,
                    ship_type: ShipType::LightFighter,
                    count: 1,
                },
                ManifestStack {
                    owner: self.b.player,
                    ship_type: ShipType::SmallCargo,
                    count: 1,
                },
            ],
            cargo: Resources::all(3 * SCALE),
            speed_percent: 100,
        }
    }
    async fn submit(&self, action: WorldAction) -> BoundReceipt {
        let id = CommandId(Uuid::new_v4());
        self.store
            .bound_admit4(ForegroundAction {
                gameplay: CommandEnvelopeV4 {
                    protocol: 4,
                    binding: self.b,
                    command_id: id,
                    command: CommandDto3::Progression(Command::World { action }),
                },
                presence: CommandEnvelopeV4 {
                    protocol: 4,
                    binding: self.b,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: Some(self.body),
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: Some(id),
                        },
                    }),
                },
            })
            .await
            .unwrap()
    }
    async fn launch(&self) -> MissionFleet {
        let intent = self.intent().await;
        let q = self.quote(&intent).await;
        self.submit(WorldAction::LaunchFleet {
            intent,
            expected_terms_hash: q.terms_hash.clone(),
        })
        .await;
        drain(&self.store, self.b.universe, self.scoped).await;
        let s = self.snap().await;
        let f = s
            .state
            .world
            .as_ref()
            .unwrap()
            .records
            .fleets
            .values()
            .find(|f| f.active())
            .unwrap()
            .clone();
        assert_eq!(f.terms, q);
        assert_eq!(f.terms.distance, 5);
        f
    }
    async fn quote(&self, intent: &FleetIntent) -> FleetTerms {
        let game = GameService::new(self.store.clone());
        let reply = game
            .world_query(
                principal(self.b),
                WorldQuery {
                    context: context(self.b),
                    query: WorldQueryKind::FleetQuote {
                        intent: intent.clone(),
                    },
                },
            )
            .await
            .unwrap();
        serde_json::from_value(reply.facts.data).unwrap()
    }
    async fn at(&self, at: i64) {
        self.store.set_test_time(at).await.unwrap();
    }
}
async fn fault(pool: &PgPool, stage: &str) {
    sqlx::query("CREATE TABLE IF NOT EXISTS orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL DEFAULT true,seen bigint NOT NULL DEFAULT 0)").execute(pool).await.unwrap();
    sqlx::query("INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES($1,'error',true) ON CONFLICT(stage) DO UPDATE SET mode='error',enabled=true").bind(stage).execute(pool).await.unwrap();
}
async fn journey(scoped: bool, speed: i32) {
    let f = Fixture::new(scoped, speed).await;
    let intent = f.intent().await;
    let game = GameService::new(f.store.clone());
    let other = game
        .world_query(
            principal(f.other),
            WorldQuery {
                context: context(f.other),
                query: WorldQueryKind::ResolveMissionSite {
                    selection: SiteSelection {
                        id: f.site,
                        expected_revision: 1,
                    },
                },
            },
        )
        .await;
    assert!(matches!(other, Err(ServiceError::NotFound)));
    for mission in [
        Mission::Transport,
        Mission::Harvest,
        Mission::Espionage,
        Mission::Deploy,
        Mission::Colonize,
        Mission::Hold,
    ] {
        let mut unsupported = intent.clone();
        unsupported.mission = mission;
        assert!(
            game.world_query(
                principal(f.b),
                WorldQuery {
                    context: context(f.b),
                    query: WorldQueryKind::FleetEstimate {
                        intent: unsupported
                    }
                }
            )
            .await
            .is_err()
        );
    }
    // Recall returns launch cargo but produces neither contact nor haul proof.
    let recalled = f.launch().await;
    f.at(recalled.launched_at + 1).await;
    f.submit(WorldAction::RecallMission { fleet: recalled.id })
        .await;
    drain(&f.store, f.b.universe, scoped).await;
    f.at(recalled.launched_at + 2).await;
    drain(&f.store, f.b.universe, scoped).await;
    assert!(f.site().await.active_references().is_empty());
    assert!(
        f.snap()
            .await
            .state
            .world
            .unwrap()
            .records
            .objective_runs
            .values()
            .all(|r| r.evidence.is_empty())
    );
    let fleet = f.launch().await;
    // One active policy and stale selections reject through the ordinary quote path.
    assert!(
        game.world_query(
            principal(f.b),
            WorldQuery {
                context: context(f.b),
                query: WorldQueryKind::FleetQuote { intent }
            }
        )
        .await
        .is_err()
    );
    f.at(fleet.due_at).await;
    let work = claim(&f.store, f.b.universe, scoped).await.unwrap();
    assert!(
        matches!(work.input().payload,Input::Event(ScheduledEvent::FleetLegDue { fleet:id,.. }) if id==fleet.id)
    );
    if let Work::Scoped(c) = &work {
        let home = f.snap().await.state.bodies[&f.body].coordinates;
        assert!(c.scopes.is_superset(&BTreeSet::from([
            ScopeKey::Site(f.site),
            ScopeKey::Player(f.b.player),
            ScopeKey::Location(home)
        ])));
    }
    let snap = work.load(&f.store).await;
    let result = transition(&snap.state, work.input(), &snap.rules);
    let TransitionResult::Applied(change) = &result else {
        panic!("{result:?}")
    };
    let after = &change.world.as_ref().unwrap().records;
    let returning = &after.fleets[&fleet.id];
    assert_eq!(returning.leg, MissionLeg::Returning);
    assert_eq!(returning.ships.len(), 2);
    assert_eq!(returning.cargo, Resources::all(103 * SCALE));
    assert_eq!(
        returning.raid.as_ref().unwrap().loot,
        Resources::all(100 * SCALE)
    );
    assert!(after.mission_sites[&f.site].remaining_forces().is_empty());
    assert!(after.debris.is_empty());
    assert_eq!(
        after
            .objective_runs
            .values()
            .find(|run| run.program.id == program().id)
            .unwrap()
            .receipts
            .len(),
        1
    );
    let before_site = f.site().await;
    fault(&f.pool, "after_writes").await;
    assert!(work.commit(&f.store, result.clone()).await.is_err());
    assert_eq!(f.site().await, before_site);
    let saved = f.snap().await;
    assert_eq!(
        saved.state.world.as_ref().unwrap().records.fleets[&fleet.id].cargo,
        fleet.cargo
    );
    fault(&f.pool, "after_commit").await;
    assert!(work.commit(&f.store, result.clone()).await.is_err());
    assert_eq!(
        f.site().await.remaining_stock().unwrap(),
        Resources::all(100 * SCALE)
    );
    work.commit(&f.store, result.clone()).await.unwrap();
    work.commit(&f.store, result).await.unwrap();
    let saved = f.snap().await;
    let returning = saved.state.world.as_ref().unwrap().records.fleets[&fleet.id].clone();
    assert_eq!(returning.terms, fleet.terms);
    f.at(returning.due_at).await;
    drain(&f.store, f.b.universe, scoped).await;
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let saved = reopened.bound_world(f.b).await.unwrap().facts.0;
    let records = &saved.state.world.as_ref().unwrap().records;
    let saved_fleet: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 AND id=$2")
            .bind(f.b.universe.0)
            .bind(fleet.id.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let saved_fleet: MissionFleet = serde_json::from_value(saved_fleet).unwrap();
    assert_eq!(saved_fleet.leg, MissionLeg::Returned);
    assert_eq!(
        records
            .objective_runs
            .values()
            .find(|run| run.program.id == program().id)
            .unwrap()
            .receipts
            .len(),
        2
    );
    assert!(f.site().await.active_references().is_empty());
    let second = f.launch().await;
    // Trusted retirement is ordered while the accepted flight remains live.
    f.at(second.launched_at + 1).await;
    f.store
        .admit_presence_scoped(CommandEnvelopeV4 {
            protocol: 4,
            binding: f.b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: None,
                    cause: PresenceCause::BodyVisit,
                    paired_command_id: None,
                },
            }),
        })
        .await
        .unwrap();
    let work = claim(&f.store, f.b.universe, false).await.unwrap();
    let snap = work.load(&f.store).await;
    let TransitionResult::Applied(mut change) = transition(&snap.state, work.input(), &snap.rules)
    else {
        panic!("retirement fixture")
    };
    let mut sites = snap
        .state
        .world
        .as_ref()
        .unwrap()
        .records
        .mission_sites
        .clone();
    let site = sites.get_mut(&f.site).unwrap();
    site.append(
        work.input(),
        site.revision(),
        SiteEventKind::Retired {
            reason: "fixture-complete".into(),
        },
    )
    .unwrap();
    attach_mission_sites(&snap.state, work.input(), &snap.rules, &mut change, sites).unwrap();
    work.commit(&f.store, TransitionResult::Applied(change))
        .await
        .unwrap();
    assert!(
        game.world_query(
            principal(f.b),
            WorldQuery {
                context: context(f.b),
                query: WorldQueryKind::FleetQuote {
                    intent: f.intent().await
                }
            }
        )
        .await
        .is_err()
    );
    f.at(second.due_at).await;
    drain(&f.store, f.b.universe, scoped).await;
    assert_eq!(
        f.site().await.remaining_stock().unwrap(),
        Resources::all(50 * SCALE)
    );
    assert!(f.site().await.remaining_forces().is_empty());
    let s = f.snap().await;
    let ret = s.state.world.as_ref().unwrap().records.fleets[&second.id].clone();
    f.at(ret.due_at).await;
    drain(&f.store, f.b.universe, scoped).await;
    assert_eq!(
        f.snap()
            .await
            .state
            .world
            .unwrap()
            .records
            .objective_runs
            .values()
            .find(|run| run.program.id == program().id)
            .unwrap()
            .receipts
            .len(),
        2
    );
}
#[tokio::test]
async fn serial_real_site_fleets_conserve_stock_cargo_and_rewards() {
    journey(false, 3).await;
}

/// Regression: the real admission path, not fixture scope declaration, must own
/// Site through contact and its return successor; writes cannot partially commit.
#[tokio::test]
async fn scoped_site_contact_commit_is_fenced_with_its_cargo_and_return_successor() {
    let f = Fixture::new(true, 2).await;
    let fleet = f.launch().await;
    f.at(fleet.due_at).await;
    let work = claim(&f.store, f.b.universe, true).await.unwrap();
    let Work::Scoped(c) = &work else {
        unreachable!()
    };
    assert!(c.scopes.contains(&ScopeKey::Site(f.site)));
    assert!(c.scopes.contains(&ScopeKey::Player(f.b.player)));
    let snap = work.load(&f.store).await;
    let home = snap.state.bodies[&f.body].coordinates;
    assert!(c.scopes.contains(&ScopeKey::Location(home)));
    let result = transition(&snap.state, work.input(), &snap.rules);
    let TransitionResult::Applied(changes) = &result else {
        panic!("{result:?}")
    };
    let next = &changes.world.as_ref().unwrap().records.fleets[&fleet.id];
    let return_at = next.due_at;
    let mut corrupted = result.clone();
    if let TransitionResult::Applied(change) = &mut corrupted {
        change
            .world
            .as_mut()
            .unwrap()
            .records
            .fleets
            .get_mut(&fleet.id)
            .unwrap()
            .cargo
            .metal += SCALE;
    }
    assert!(matches!(
        work.commit(&f.store, corrupted).await,
        Err(StoreError::CorruptData)
    ));

    assert_eq!(next.cargo, Resources::all(103 * SCALE));
    fault(&f.pool, "after_writes").await;
    assert!(work.commit(&f.store, result.clone()).await.is_err());
    assert_eq!(
        f.site().await.remaining_stock().unwrap(),
        Resources::all(200 * SCALE)
    );
    fault(&f.pool, "after_commit").await;
    assert!(work.commit(&f.store, result.clone()).await.is_err());
    work.commit(&f.store, result).await.unwrap();
    assert_eq!(
        f.site().await.remaining_stock().unwrap(),
        Resources::all(100 * SCALE)
    );
    assert!(f.site().await.remaining_forces().is_empty());
    let snapshot = f.snap().await;
    assert_eq!(
        snapshot.state.world.as_ref().unwrap().records.fleets[&fleet.id].cargo,
        Resources::all(103 * SCALE)
    );
    f.at(return_at).await;
    let successor = claim(&f.store, f.b.universe, true).await.unwrap();
    let Work::Scoped(c) = &successor else {
        unreachable!()
    };
    assert!(c.scopes.is_superset(&BTreeSet::from([
        ScopeKey::Site(f.site),
        ScopeKey::Player(f.b.player),
        ScopeKey::Location(home)
    ])));
    let snapshot = successor.load(&f.store).await;
    let result = transition(&snapshot.state, successor.input(), &snapshot.rules);
    assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
    successor.commit(&f.store, result).await.unwrap();
    assert!(f.site().await.active_references().is_empty());
}

/// Regression: real HTTP decoding and authenticated projections must not expose
/// a private site's identity, reports or selection through alternate callers.
#[tokio::test]
async fn http_site_selection_quote_and_reports_are_private_and_decimal_safe() {
    use http_body_util::BodyExt;
    use orbit_transport_http::test_http::{Body, Request};
    use tower::ServiceExt;
    let f = Fixture::new(false, 3).await;
    let app = orbit_transport_http::router(
        f.store.clone(),
        orbit_transport_http::HttpConfig {
            account_url: None,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            origin: "https://game.test".into(),
            assets: "missing-assets".into(),
            login_per_minute: 30,
            wake: None,
            observer: None,
        },
    );
    let mut sessions = vec![];
    for b in [f.b, f.other] {
        let name: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id=$1")
            .bind(b.account.0)
            .fetch_one(&f.pool)
            .await
            .unwrap();
        let response = app
            .clone()
            .oneshot(
                Request::post("/api/v1/session")
                    .header("content-type", "application/json")
                    .header("origin", "https://game.test")
                    .body(Body::from(
                        json!({"name":name,"password":"password"}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let cookie = response.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .to_owned();
        let session: serde_json::Value =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        sessions.push((cookie, session["csrf"].as_str().unwrap().to_owned()));
    }
    async fn post(
        app: axum::Router,
        path: String,
        session: &(String, String),
        body: serde_json::Value,
    ) -> (u16, serde_json::Value) {
        let response = app
            .oneshot(
                Request::post(path)
                    .header("cookie", &session.0)
                    .header("x-csrf-token", &session.1)
                    .header("origin", "https://game.test")
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status().as_u16();
        let body =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        (status, body)
    }
    let path = format!("/api/v4/universes/{}/world", f.b.universe);
    let (status, tutorial) = post(
        app.clone(),
        path.clone(),
        &sessions[0],
        json!({"context":context(f.b),"type":"Tutorial"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(tutorial["data"]["enrolled"], true);
    assert!(tutorial["data"]["receipts"].as_array().unwrap().is_empty());
    assert!(tutorial["data"]["sites"].as_array().unwrap().is_empty());
    let (status, _) = post(
        app.clone(),
        path.clone(),
        &sessions[0],
        json!({"context":context(f.other),"type":"Tutorial"}),
    )
    .await;
    assert_eq!(status, 404);

    let (status, body) = post(
        app.clone(),
        path.clone(),
        &sessions[0],
        json!({"context":context(f.b),"type":"MissionSites"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(
        body["data"][0]["destination"]["selection"]["id"],
        json!(f.site)
    );
    assert!(body["data"][0]["remaining_stock"]["metal"].is_string());
    let selection = json!({"id":f.site,"expected_revision":"1"});
    let (status, body) = post(
        app.clone(),
        path.clone(),
        &sessions[0],
        json!({"context":context(f.b),"type":"ResolveMissionSite","selection":selection}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["data"]["type"], "Site");
    let (status, _) = post(
        app.clone(),
        path.clone(),
        &sessions[1],
        json!({"context":context(f.other),"type":"ResolveMissionSite","selection":selection}),
    )
    .await;
    assert_eq!(status, 404);
    let (status, body) = post(
        app.clone(),
        path.clone(),
        &sessions[1],
        json!({"context":context(f.other),"type":"MissionSites"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(body["data"], json!([]));
    let intent = f.intent().await;
    let (status, body) = post(
        app.clone(),
        path,
        &sessions[0],
        json!({"context":context(f.b),"type":"FleetQuote","intent":intent}),
    )
    .await;
    assert_eq!(status, 200);
    let _: FleetTerms = serde_json::from_value(body["data"].clone()).unwrap();
    let fleet = f.launch().await;
    f.at(fleet.due_at).await;
    drain(&f.store, f.b.universe, false).await;
    let report: Uuid = sqlx::query_scalar(
        "SELECT id FROM mission_reports WHERE universe=$1 AND kind='SiteEncounter'",
    )
    .bind(f.b.universe.0)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let path = format!("/api/v4/universes/{}/reports/{report}", f.b.universe);
    let (status, body) = post(app.clone(), path.clone(), &sessions[0], json!(context(f.b))).await;
    assert_eq!(status, 200);
    assert_eq!(body["data"]["payload"]["kind"], "SiteEncounter");
    assert_eq!(body["data"]["payload"]["fleet"], json!(fleet.id));
    assert_eq!(body["data"]["header"]["preview"]["site"], json!(f.site));
    assert_eq!(
        body["data"]["header"]["preview"]["outcome"],
        "AttackerVictory"
    );
    assert_eq!(
        body["data"]["header"]["preview"]["loot"],
        body["data"]["payload"]["loot"]
    );
    assert!(body["data"]["header"]["preview"].get("battle").is_none());
    let detail = body.clone();
    let (page_status, page) = post(
        app.clone(),
        format!("/api/v4/universes/{}/reports", f.b.universe),
        &sessions[0],
        json!({"context":context(f.b),"cursor":null,"limit":20,"include_hidden":false}),
    )
    .await;
    assert_eq!(page_status, 200);
    let directory = std::path::Path::new("/tmp/orbit-chat4-d2d8");
    std::fs::create_dir_all(directory).unwrap();
    std::fs::write(
        directory.join("site-report.json"),
        serde_json::to_vec_pretty(&json!({"detail":detail,"inbox":page})).unwrap(),
    )
    .unwrap();

    assert!(body["data"]["payload"]["battle"]["participants"][0]["units"][0]["count"].is_string());
    assert!(
        body["data"]["payload"]["battle"]
            .get("rng_cursor")
            .is_none()
    );
    let (status, _) = post(
        app.clone(),
        path.clone(),
        &sessions[1],
        json!(context(f.other)),
    )
    .await;
    assert_eq!(status, 404);
    let (status,_)=post(app,format!("{path}/share"),&sessions[0],json!({"context":context(f.b),"action":{"type":"Create","options":{"include_identity":true,"include_coordinates":true}}})).await;
    assert_eq!(status, 404);
}

/// Regression: deleting an empire during either leg must atomically cancel the
/// accepted Site event and settle its retained operation reference, even scoped.
#[tokio::test]
async fn empire_removal_settles_outbound_and_returning_site_references_without_delivery_grants() {
    for scoped in [false, true] {
        for returning in [false, true] {
            let f = Fixture::new(scoped, 3).await;
            let deletion = CommandEnvelopeV4 {
                protocol: 4,
                binding: f.b,
                command_id: CommandId(Uuid::new_v4()),
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RequestEmpireDeletion,
                }),
            };
            let presence = CommandEnvelopeV4 {
                protocol: 4,
                binding: f.b,
                command_id: CommandId(Uuid::new_v4()),
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::GameplayGesture,
                        paired_command_id: Some(deletion.command_id),
                    },
                }),
            };
            f.store
                .bound_admit4(ForegroundAction {
                    presence,
                    gameplay: deletion,
                })
                .await
                .unwrap();
            drain(&f.store, f.b.universe, scoped).await;
            let deletion_at:i64=sqlx::query_scalar("SELECT min(at_ms) FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND NOT done AND NOT cancelled").bind(f.b.universe.0).bind(f.b.player.to_string()).fetch_one(&f.pool).await.unwrap();
            let duration = f.quote(&f.intent().await).await.duration_ms;
            f.at(deletion_at - if returning { duration + 1 } else { 1 })
                .await;
            let fleet = f.launch().await;
            if returning {
                f.at(fleet.due_at).await;
                drain(&f.store, f.b.universe, scoped).await;
            }
            assert_eq!(f.site().await.active_references().len(), 1);
            f.at(deletion_at).await;
            drain(&f.store, f.b.universe, scoped).await;
            assert!(f.site().await.active_references().is_empty());
            let raw: serde_json::Value =
                sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 AND id=$2")
                    .bind(f.b.universe.0)
                    .bind(fleet.id.0)
                    .fetch_one(&f.pool)
                    .await
                    .unwrap();
            let saved: MissionFleet = serde_json::from_value(raw).unwrap();
            assert_eq!(saved.leg, MissionLeg::Destroyed);
            assert!(saved.ships.is_empty());
            assert_eq!(saved.cargo, Resources::default());
            let pending: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM pending_inputs WHERE universe=$1 AND input::text LIKE $2",
            )
            .bind(f.b.universe.0)
            .bind(format!("%{}%", fleet.id))
            .fetch_one(&f.pool)
            .await
            .unwrap();
            assert_eq!(pending, 0);
            let receipts: serde_json::Value = sqlx::query_scalar(
                "SELECT data->'receipts' FROM objective_runs WHERE universe=$1 AND beneficiary=$2 AND program=$3",
            )
            .bind(f.b.universe.0)
            .bind(f.b.player.0)
            .bind(program().id)
            .fetch_one(&f.pool)
            .await
            .unwrap();
            assert!(
                receipts
                    .as_object()
                    .unwrap()
                    .values()
                    .all(|receipt| receipt["objective"] != "delivery")
            );
        }
    }
}
