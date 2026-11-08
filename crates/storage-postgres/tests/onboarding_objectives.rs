//! Regression: reward records, homeworld resources, and causal completion share one fenced commit.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
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
fn definition(id: &str, predicate: ObjectivePredicate) -> ObjectiveDefinition {
    ObjectiveDefinition {
        id: id.into(),
        explanation: id.into(),
        predicate,
        reward: Resources::all(1000 * SCALE),
    }
}
fn program() -> ObjectiveProgram {
    ObjectiveProgram {
        id: "storage-fixture".into(),
        version: 1,
        objectives: vec![
            definition(
                "building",
                ObjectivePredicate::Building {
                    building: Building::MetalMine,
                    minimum: 1,
                },
            ),
            definition(
                "research",
                ObjectivePredicate::Research {
                    research: ResearchId::CombustionDrive,
                    minimum: 1,
                },
            ),
            definition(
                "manufacture",
                ObjectivePredicate::Manufacture {
                    ship: ShipType::LightFighter,
                    quantity: 1,
                },
            ),
        ],
    }
}
async fn submit(store: &PgStore, b: Binding, body: BodyId, command: Command) {
    let game = GameService::new(store.clone());
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(command),
    };
    let presence = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: Some(body),
                cause: PresenceCause::GameplayGesture,
                paired_command_id: Some(gameplay.command_id),
            },
        }),
    };
    game.world_submit(principal(b), ForegroundAction { presence, gameplay })
        .await
        .unwrap();
}
async fn start(store: &PgStore, b: Binding, body: BodyId, q: QuoteRequest, scoped: bool) {
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let quote = quote(
        &snapshot.state,
        Actor::Player(b.player),
        &q,
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    let command = match q {
        QuoteRequest::Upgrade { building, .. } => Command::StartUpgrade {
            body,
            building,
            expected_terms_hash: quote.terms_hash,
        },
        QuoteRequest::Research { research, .. } => Command::StartResearch {
            host: body,
            research,
            expected_terms_hash: quote.terms_hash,
        },
        QuoteRequest::Manufacture { item, quantity, .. } => Command::StartManufacture {
            body,
            item,
            quantity,
            expected_terms_hash: quote.terms_hash,
        },
        _ => panic!("unsupported fixture request"),
    };
    submit(store, b, body, command).await;
    drain(store, b.universe, scoped).await;
}
async fn complete_next(store: &PgStore, pool: &sqlx::PgPool, b: Binding, scoped: bool) {
    let due: i64 = sqlx::query_scalar(
        "SELECT min(at_ms) FROM scheduled_events WHERE universe=$1 AND NOT done AND NOT cancelled",
    )
    .bind(b.universe.0)
    .fetch_one(pool)
    .await
    .unwrap();
    store.set_test_time(due).await.unwrap();
    drain(store, b.universe, scoped).await;
}
#[tokio::test]
async fn serial_objective_payment_rolls_back_and_unknown_commit_retry_does_not_mint_twice() {
    journey(false).await;
}
async fn journey(scoped: bool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("objective-{}-{i}", if scoped { "scope" } else { "serial" }),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[71; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let session = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap()
        .session;
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let (initial, _) = store.bound_world(b).await.unwrap().facts;
    assert!(
        initial
            .state
            .world
            .as_ref()
            .unwrap()
            .records
            .objective_runs
            .is_empty()
    );
    let home = initial.state.world.as_ref().unwrap().homeworlds[&b.player];
    // Test-only consumer enrollment is composed into a real ordered presence change.
    game.world_presence(
        principal(b),
        CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(home),
                    cause: PresenceCause::BodyVisit,
                    paired_command_id: None,
                },
            }),
        },
    )
    .await
    .unwrap();
    let c = claim(&store, u, false).await.unwrap();
    let loaded = c.load(&store).await;
    let TransitionResult::Applied(mut changes) =
        transition(&loaded.state, c.input(), &loaded.rules)
    else {
        panic!("presence must apply")
    };
    let run_id = enroll_objective_program(
        &loaded.state,
        c.input(),
        &loaded.rules,
        &mut changes,
        b.player,
        program(),
    )
    .unwrap();
    assert!(matches!(
        c.commit(&store, TransitionResult::Applied(changes))
            .await
            .unwrap(),
        CommitOutcome::Committed { .. }
    ));
    if scoped {
        sqlx::raw_sql(&format!("CREATE SEQUENCE orbit_order_{} START 100000; UPDATE universe_runtime SET executor_mode='scoped',mode_generation=1 WHERE universe='{}'",u.0.simple(),u)).execute(&pool).await.unwrap();
    }
    // Independent colony at a different location. Preserve canonical homeworld in manifest.
    let colony = BodyId(Uuid::new_v4());
    let position:i32=sqlx::query_scalar("SELECT pos FROM generate_series(1,15) AS pos WHERE NOT EXISTS (SELECT 1 FROM bodies b JOIN bodies h ON h.id=$1 WHERE b.universe=h.universe AND b.galaxy=h.galaxy AND b.system=h.system AND b.position=pos AND b.kind='Planet') ORDER BY pos LIMIT 1").bind(home.0).fetch_one(&pool).await.unwrap();
    sqlx::query("INSERT INTO bodies SELECT $2,universe,owner,kind,galaxy,system,$3,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies WHERE id=$1").bind(home.0).bind(colony.0).bind(position).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO building_levels SELECT $2,building,level FROM building_levels WHERE body=$1",
    )
    .bind(home.0)
    .bind(colony.0)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO production_settings(body,data,revision) SELECT $2,jsonb_set(data,'{body}',to_jsonb($2::text)),0 FROM production_settings WHERE body=$1").bind(home.0).bind(colony.0).execute(&pool).await.unwrap();
    for kind in [
        "production".into(),
        "constructions".into(),
        "manufacturing".into(),
        format!("inventory:{}", b.player),
    ] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(u.0)
            .bind(kind)
            .bind(colony.0)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::query("UPDATE bodies SET amounts=$2 WHERE universe=$1 AND owner=$3")
        .bind(u.0)
        .bind(sqlx::types::Json(Resources::all(1_000_000 * SCALE)))
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    start(
        &store,
        b,
        colony,
        QuoteRequest::Upgrade {
            body: colony,
            building: Building::MetalMine,
        },
        scoped,
    )
    .await;
    let due: i64 = sqlx::query_scalar(
        "SELECT due_at FROM constructions WHERE universe=$1 AND body=$2 AND status='Active'",
    )
    .bind(u.0)
    .bind(colony.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    store.set_test_time(due).await.unwrap();
    let home_scope = ScopeKey::Location(initial.state.bodies[&home].coordinates);
    if scoped {
        let mut lock = pool.begin().await.unwrap();
        sqlx::query(
            "SELECT key FROM execution_scopes WHERE universe=$1 AND key=$2 FOR NO KEY UPDATE",
        )
        .bind(u.0)
        .bind(serde_json::to_string(&home_scope).unwrap())
        .fetch_one(&mut *lock)
        .await
        .unwrap();
        assert!(
            claim(&store, u, true).await.is_none(),
            "colony completion must wait for homeworld location"
        );
        lock.rollback().await.unwrap();
    }
    let work = claim(&store, u, scoped).await.unwrap();
    if let Work::Scoped(c) = &work {
        assert!(c.scopes.contains(&home_scope));
    }
    let f = work.load(&store).await;
    assert!(f.state.coverage.production_bodies.contains(&home));
    let result = transition(&f.state, work.input(), &f.rules);
    let TransitionResult::Applied(changes) = &result else {
        panic!("{result:?}")
    };
    assert_eq!(
        changes.world.as_ref().unwrap().records.objective_runs[&run_id]
            .receipts
            .len(),
        1
    );
    assert!(changes.bodies.iter().any(|x| x.id == home));
    assert!(changes.bodies.iter().any(|x| x.id == colony));
    let before: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_writes','error',true)").execute(&pool).await.unwrap();
    assert!(matches!(
        work.commit(&store, result.clone()).await,
        Err(StoreError::Unavailable)
    ));
    let after: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, after);
    let saved: serde_json::Value =
        sqlx::query_scalar("SELECT data FROM objective_runs WHERE id=$1")
            .bind(run_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(saved["receipts"], serde_json::json!({}));
    sqlx::query(
        "INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_commit','error',true)",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        work.commit(&store, result.clone()).await,
        Err(StoreError::Unavailable)
    ));
    let paid: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(before, paid);
    assert_eq!(
        serde_json::from_value::<Resources>(paid.clone()).unwrap(),
        Resources::all(1_001_000 * SCALE)
    );
    let reopened = PgStore::connect(&url).await.unwrap();
    assert!(matches!(
        work.commit(&reopened, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let repaid: serde_json::Value = sqlx::query_scalar("SELECT amounts FROM bodies WHERE id=$1")
        .bind(home.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(paid, repaid);
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(&pool)
        .await
        .unwrap();
    // Real prerequisite construction, research, and manufacture events exercise the same hook.
    for building in [
        Building::ResearchLab,
        Building::RoboticsFactory,
        Building::RoboticsFactory,
        Building::Shipyard,
    ] {
        start(
            &reopened,
            b,
            colony,
            QuoteRequest::Upgrade {
                body: colony,
                building,
            },
            scoped,
        )
        .await;
        complete_next(&reopened, &pool, b, scoped).await;
    }
    for research in [ResearchId::EnergyTechnology, ResearchId::CombustionDrive] {
        start(
            &reopened,
            b,
            colony,
            QuoteRequest::Research {
                host: colony,
                research,
            },
            scoped,
        )
        .await;
        complete_next(&reopened, &pool, b, scoped).await;
    }
    start(
        &reopened,
        b,
        colony,
        QuoteRequest::Manufacture {
            body: colony,
            item: ManufacturedItem::Ship(ShipType::LightFighter),
            quantity: 1,
        },
        scoped,
    )
    .await;
    complete_next(&reopened, &pool, b, scoped).await;
    let service = GameService::new(reopened.clone());
    let receipts = service
        .milestone_receipts(principal(b), context(b))
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(receipts.len(), 3);
    assert!(
        receipts
            .iter()
            .all(|r| r.homeworld == home && r.beneficiary == b.player)
    );
    let other = SessionService::new(reopened.clone())
        .login(&accounts[1].name, &accounts[1].password, None)
        .await
        .unwrap()
        .session;
    let other = service
        .current_binding(other.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    assert!(
        service
            .milestone_receipts(principal(other), context(b))
            .await
            .is_err()
    );
    assert!(
        service
            .milestone_receipts(principal(other), context(other))
            .await
            .unwrap()
            .facts
            .data
            .is_empty()
    );
    let mut wrong_epoch = b;
    wrong_epoch.epoch = Epoch(Uuid::new_v4());
    assert!(
        service
            .milestone_receipts(principal(b), context(wrong_epoch))
            .await
            .is_err()
    );
    let (restored, _) = reopened.bound_world(b).await.unwrap().facts;
    assert_eq!(
        restored
            .state
            .world
            .as_ref()
            .unwrap()
            .records
            .objective_runs[&run_id]
            .receipts
            .len(),
        3
    );
    assert!(restored.state.inventories.iter().any(|x| x.body == colony
        && x.item == ManufacturedItem::Ship(ShipType::LightFighter)
        && x.count == 1));
}

#[tokio::test]
async fn scoped_encounter_evidence_requires_grant_authority_and_commits_once() {
    // Direct authoritative encounter seam; no fleet simulation or tutorial is activated.
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("evidence-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[72; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let session = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap()
        .session;
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    sqlx::raw_sql(&format!("CREATE SEQUENCE orbit_order_{} START 100000; UPDATE universe_runtime SET executor_mode='scoped',mode_generation=1 WHERE universe='{}'",u.0.simple(),u)).execute(&pool).await.unwrap();
    let presence = || CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: None,
                cause: PresenceCause::AccountVisit,
                paired_command_id: None,
            },
        }),
    };
    store.admit_presence_scoped(presence()).await.unwrap();
    let c = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let f = store.load_scoped(&c).await.unwrap();
    let home = f.state.world.as_ref().unwrap().homeworlds[&b.player];
    let location = ScopeKey::Location(f.state.bodies[&home].coordinates);
    assert!(!c.scopes.contains(&location));
    let original = transition(&f.state, &c.input, &f.rules);
    let TransitionResult::Applied(mut changed) = original.clone() else {
        panic!("{original:?}")
    };
    let program = ObjectiveProgram {
        id: "encounter-fixture".into(),
        version: 1,
        objectives: vec![
            definition("contact", ObjectivePredicate::Attack),
            definition(
                "haul",
                ObjectivePredicate::RaidReturn {
                    required_ships: Default::default(),
                },
            ),
        ],
    };
    let id = enroll_objective_program(
        &f.state,
        &c.input,
        &f.rules,
        &mut changed,
        b.player,
        program,
    )
    .unwrap();
    // Owner facts are loaded, but enrollment cannot escape the actual held Location scope.
    assert!(matches!(
        store
            .commit_scoped(&c, TransitionResult::Applied(changed.clone()))
            .await,
        Err(StoreError::CorruptData)
    ));
    assert!(matches!(
        store.commit_scoped(&c, original).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let run = &changed.world.as_ref().unwrap().records.objective_runs[&id];
    // Test fixture installs the validated binding at a quiescent point, then uses real fenced commits.
    sqlx::query("INSERT INTO objective_runs(id,universe,epoch,beneficiary,program,data) VALUES($1,$2,$3,$4,$5,$6)").bind(id.0).bind(u.0).bind(b.epoch.0).bind(b.player.0).bind(&run.program.id).bind(sqlx::types::Json(run)).execute(&pool).await.unwrap();
    store.set_test_time(1001).await.unwrap();
    store.admit_presence_scoped(presence()).await.unwrap();
    let mut lock = pool.begin().await.unwrap();
    sqlx::query("SELECT key FROM execution_scopes WHERE universe=$1 AND key=$2 FOR NO KEY UPDATE")
        .bind(u.0)
        .bind(serde_json::to_string(&location).unwrap())
        .fetch_one(&mut *lock)
        .await
        .unwrap();
    assert!(
        store
            .claim_scoped(u, WorkerId(Uuid::new_v4()))
            .await
            .unwrap()
            .is_none()
    );
    lock.rollback().await.unwrap();
    let c = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(c.scopes.contains(&location));
    let f = store.load_scoped(&c).await.unwrap();
    let TransitionResult::Applied(mut changes) = transition(&f.state, &c.input, &f.rules) else {
        panic!("expected presence")
    };
    let fleet = FleetId(Uuid::new_v4());
    let evidence = vec![
        ObjectiveFact::AttackResolved { fleet },
        ObjectiveFact::RaidReturned {
            fleet,
            destination: home,
            loot: Resources::all(1),
            ships: Default::default(),
        },
    ]
    .into_iter()
    .map(|fact| ObjectiveEvidence {
        input: c.input.id,
        order: objective_order(&c.input),
        actor: c.input.actor,
        beneficiary: b.player,
        operation: OperationId(fleet.0),
        fact,
    })
    .collect();
    apply_objective_evidence(&f.state, &c.input, &f.rules, &mut changes, evidence).unwrap();
    assert_eq!(
        changes.world.as_ref().unwrap().records.objective_runs[&id]
            .receipts
            .len(),
        2
    );
    let mut corrupt = changes.clone();
    corrupt
        .world
        .as_mut()
        .unwrap()
        .records
        .objective_runs
        .get_mut(&id)
        .unwrap()
        .evidence[0]
        .input = InputId(Uuid::new_v4());
    assert!(matches!(
        store
            .commit_scoped(&c, TransitionResult::Applied(corrupt))
            .await,
        Err(StoreError::CorruptData)
    ));
    let result = TransitionResult::Applied(changes);
    assert!(matches!(
        store.commit_scoped(&c, result.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let reopened = PgStore::connect(&url).await.unwrap();
    assert!(matches!(
        reopened.commit_scoped(&c, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert_eq!(
        GameService::new(reopened)
            .milestone_receipts(principal(b), context(b))
            .await
            .unwrap()
            .facts
            .data
            .len(),
        2
    );
}
