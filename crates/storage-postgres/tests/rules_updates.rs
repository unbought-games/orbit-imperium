use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;
#[path = "rules_updates/fusion.rs"]
mod fusion;
#[path = "rules_updates/standard.rs"]
mod standard;

#[tokio::test]
async fn custom_saved_catalog_survives_startup_and_initializes_signup() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(5),
                positions_per_system: None,
            },
            Some(45),
        )
        .await
        .unwrap()
        .universe;
    let mut a = store.load_rules(u).await.unwrap().artifact;
    a.id = "custom-universe".into();
    a.base_income[0] = 45;
    a.progression.as_mut().unwrap().research.insert(
        ResearchId::LaserTechnology,
        BuildingRule {
            base: [200, 100, 0],
            growth: [2, 1],
        },
    );
    let e = a
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::LaserTechnology))
        .unwrap();
    e.enabled = true;
    e.requirements = vec![
        Requirement::BodyBuilding {
            building: Building::ResearchLab,
            level: 1,
        },
        Requirement::PlayerResearch {
            research: ResearchId::EnergyTechnology,
            level: 2,
        },
    ];
    let r = Ruleset::from_artifact(a, 10).unwrap();
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3)")
        .bind(&r.hash.0)
        .bind(&r.artifact.id)
        .bind(sqlx::types::Json(&r))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(&r.hash.0)
        .execute(&pool)
        .await
        .unwrap();
    drop(
        store
            .server_guard_config(None)
            .await
            .expect("custom rules may start"),
    );
    assert_eq!(
        store
            .ensure_signup_universe(Some(u), Default::default(), None)
            .await
            .unwrap()
            .universe,
        u
    );
    let session = SessionService::new(store.clone())
        .signup(
            &format!("custom{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let player = session.session.memberships[0].player;
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='LaserTechnology'",
    )
    .bind(player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    assert_eq!(store.load_rules(u).await.unwrap(), r);
    drop(store.server_guard_config(None).await.unwrap());
}

async fn setup() -> (PgStore, PgPool, UniverseId, Binding) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let u = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(5),
                positions_per_system: None,
            },
            Some(45),
        )
        .await
        .unwrap()
        .universe;
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("rules{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let binding = Binding {
        account: auth.session.account,
        player: auth.session.memberships[0].player,
        universe: u,
        epoch: GameService::new(store.clone())
            .current_binding(auth.session.account, u, Uuid::new_v4())
            .await
            .unwrap()
            .binding
            .epoch,
    };
    (store, PgPool::connect(&url).await.unwrap(), u, binding)
}
fn expanded_rules(profile: UniverseProfile) -> RulesArtifact {
    let mut artifact: RulesArtifact = serde_json::from_slice(include_bytes!(
        "../../../scripts/fixtures/rules-expanded.json"
    ))
    .unwrap();
    artifact.universe = Some(profile);
    artifact
}

#[tokio::test]
async fn activation_settles_old_production_initializes_once_and_preserves_identity() {
    let (store, pool, u, b) = setup().await;
    let service = RulesService::new(store.clone());
    let mut doc = service.export(u).await.unwrap();
    doc.artifact = expanded_rules(doc.artifact.universe.clone().unwrap());
    doc.artifact.base_income[0] = 45;
    let diff = service.diff(&doc).await.unwrap();
    assert_eq!(
        diff.initialize.add_research,
        vec![ResearchId::LaserTechnology]
    );
    assert_eq!(
        store.load_rules(u).await.unwrap().artifact.base_income[0],
        30
    );
    let updates_before = store.read_updates(b, None, 128).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    store.set_test_time(3_601_000).await.unwrap();
    assert!(matches!(
        service.apply(&doc).await.unwrap(),
        RulesApplyOutcome::Applied {
            revision: 1,
            effective_at: 3_601_000,
            ..
        }
    ));
    let updates = store
        .read_updates(b, Some(&updates_before), 128)
        .await
        .unwrap();
    assert!(
        updates
            .items
            .iter()
            .any(|item| matches!(item.event, StreamEvent::Invalidate { .. })),
        "rules activation must invalidate connected viewers"
    );
    let amounts: serde_json::Value =
        sqlx::query_scalar("SELECT amounts FROM bodies WHERE owner=$1")
            .bind(b.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(amounts["metal"], 1_300_000_000i64);
    assert!(matches!(
        service.apply(&doc).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { revision: 1, .. }
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='LaserTechnology'",
    )
    .bind(b.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    store.set_test_time(7_201_000).await.unwrap();
    let (snap, _) = store.bound_world(b).await.unwrap().facts;
    let body = snap
        .state
        .bodies
        .values()
        .find(|x| x.owner == b.player)
        .unwrap();
    assert_eq!(
        settle_economy(body, 7_201_000, &snap.rules)
            .unwrap()
            .amounts
            .metal,
        1_750_000_000
    );
    assert_eq!(snap.state.epoch, b.epoch);
    drop(store.server_guard_config(None).await.unwrap());
}
#[tokio::test]
async fn concurrent_edits_have_one_winner_and_other_universe_is_unchanged() {
    let (store, _, u, _) = setup().await;
    let other = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(5),
                positions_per_system: None,
            },
            Some(45),
        )
        .await
        .unwrap()
        .universe;
    let service = RulesService::new(store.clone());
    let mut a = service.export(u).await.unwrap();
    let mut b = a.clone();
    a.artifact.base_income[0] = 40;
    b.artifact.base_income[0] = 50;
    let (x, y) = tokio::join!(service.apply(&a), service.apply(&b));
    assert_eq!(usize::from(x.is_ok()) + usize::from(y.is_ok()), 1);
    assert!(matches!(
        x.err().or(y.err()),
        Some(RulesUpdateError::Stale { .. })
    ));
    assert_eq!(
        store.load_rules(other).await.unwrap().artifact.base_income[0],
        30
    );
}
#[tokio::test]
async fn activation_waits_for_admitted_and_claimed_work() {
    let (store, pool, u, b) = setup().await;
    let service = RulesService::new(store.clone());
    let mut doc = service.export(u).await.unwrap();
    doc.artifact.base_income[0] = 40;
    store
        .admit(
            Actor::Player(b.player),
            u,
            CommandEnvelope {
                command_id: CommandId(Uuid::new_v4()),
                epoch: b.epoch,
                protocol: 4,
                command: Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: None,
                        cause: PresenceCause::AccountVisit,
                        paired_command_id: None,
                    },
                },
            },
        )
        .await
        .unwrap();
    assert!(matches!(
        service.apply(&doc).await,
        Err(RulesUpdateError::Busy)
    ));
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        service.apply(&doc).await,
        Err(RulesUpdateError::Busy)
    ));
    GameService::new(store.clone())
        .resolve_claim(claim)
        .await
        .unwrap();
    assert!(matches!(
        service.apply(&doc).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    store.prepare_scoped_runtime(u, 1).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let mut next = service.export(u).await.unwrap();
    next.artifact.base_income[0] = 41;
    next.speed = 3;
    let game = GameService::new(store.clone());
    let presence = || CommandEnvelope {
        command_id: CommandId(Uuid::new_v4()),
        epoch: b.epoch,
        protocol: 4,
        command: Command::World {
            action: WorldAction::RecordForegroundPresence {
                body: None,
                cause: PresenceCause::AccountVisit,
                paired_command_id: None,
            },
        },
    };
    let early = presence();
    store
        .admit(Actor::Player(b.player), u, early.clone())
        .await
        .unwrap();
    // Enrollment is independent of unrelated backlog.
    SessionService::new(store.clone())
        .signup(
            &format!("queued{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let barrier = match service.apply(&next).await {
        Err(RulesUpdateError::Pending { id }) => id,
        other => panic!("expected durable pending barrier: {other:?}"),
    };
    assert!(
        matches!(service.apply(&next).await, Err(RulesUpdateError::Pending { id }) if id == barrier)
    );
    let later = presence();
    store
        .admit(Actor::Player(b.player), u, later.clone())
        .await
        .unwrap();
    assert!(game.view(Actor::Player(b.player), u).await.is_ok());
    let worker = WorkerId(Uuid::new_v4());
    assert!(matches!(
        game.step_scoped(u, worker, &InlineEngine).await.unwrap(),
        StepOutcome::Committed { .. }
    ));
    assert!(store.claim_scoped(u, worker).await.unwrap().is_none());
    assert!(store.process_runtime_barrier(u).await.unwrap());
    // This order was admitted with the previous profile and executes under the new one.
    let claim = store.claim_scoped(u, worker).await.unwrap().unwrap();
    let mut corrupt = claim.clone();
    corrupt.input.profile_hash = Hash("missing-provenance".into());
    assert!(matches!(
        store.load_scoped(&corrupt).await,
        Err(StoreError::CorruptData)
    ));
    assert!(matches!(
        game.resolve_scoped_claim(claim, &InlineEngine)
            .await
            .unwrap(),
        StepOutcome::Committed { .. }
    ));
    assert!(matches!(
        game.receipt(Actor::Player(b.player), u, later.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    assert!(matches!(
        service.apply(&next).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let auditable = presence();
    let receipt = store
        .admit(Actor::Player(b.player), u, auditable)
        .await
        .unwrap();
    store.audit_universe(u).await.unwrap();
    let input_id: Uuid =
        sqlx::query_scalar("SELECT input_id FROM commands WHERE universe=$1 AND command_id=$2")
            .bind(u.0)
            .bind(receipt.command_id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let key: String = sqlx::query_scalar(
        "DELETE FROM input_scopes WHERE universe=$1 AND input_id=$2 RETURNING scope_key",
    )
    .bind(u.0)
    .bind(input_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let audited = store.audit_universe(u).await;
    sqlx::query("INSERT INTO input_scopes(universe,input_id,scope_key) VALUES($1,$2,$3)")
        .bind(u.0)
        .bind(input_id)
        .bind(key)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        audited.is_err(),
        "explicit audit must detect missing execution declarations"
    );
}
#[tokio::test]
async fn failed_activation_rolls_back_all_state_and_can_be_retried() {
    let (store, pool, u, b) = setup().await;
    let service = RulesService::new(store.clone());
    let before = service.export(u).await.unwrap();
    let mut doc = before.clone();
    doc.artifact = expanded_rules(doc.artifact.universe.clone().unwrap());
    sqlx::raw_sql("CREATE FUNCTION fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test activation failure'; END $$; CREATE TRIGGER fail_activation BEFORE INSERT ON rules_activations FOR EACH ROW EXECUTE FUNCTION fail_activation();").execute(&pool).await.unwrap();
    assert!(service.apply(&doc).await.is_err());
    sqlx::raw_sql(
        "DROP TRIGGER fail_activation ON rules_activations; DROP FUNCTION fail_activation();",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        service.export(u).await.unwrap().base_revision,
        before.base_revision
    );
    assert_eq!(store.load_rules(u).await.unwrap().artifact, before.artifact);
    let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM research_levels WHERE owner=$1 AND research='LaserTechnology')").bind(b.player.0).fetch_one(&pool).await.unwrap();
    assert!(!exists);
    assert!(service.apply(&doc).await.is_ok());
}

#[tokio::test]
async fn pending_construction_completes_after_activation_with_original_payment() {
    let (store, pool, u, b) = setup().await;
    let game = GameService::new(store.clone());
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let body = *snapshot.state.bodies.keys().next().unwrap();
    let terms = inspect_progression(
        &snapshot.state,
        Actor::Player(b.player),
        &QuoteRequest::Upgrade {
            body,
            building: Building::MetalMine,
        },
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    let command_id = CommandId(Uuid::new_v4());
    let pair = ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id,
            command: CommandDto3::Progression(Command::StartUpgrade {
                body,
                building: Building::MetalMine,
                expected_terms_hash: terms.terms_hash.unwrap(),
            }),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(body),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            }),
        },
    };
    store.bound_admit4(pair).await.unwrap();
    for _ in 0..2 {
        assert!(matches!(
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap(),
            StepOutcome::Committed { .. }
        ));
    }
    let before: (i64, serde_json::Value, String) =
        sqlx::query_as("SELECT due_at,paid,profile_hash FROM constructions WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let service = RulesService::new(store.clone());
    let mut doc = service.export(u).await.unwrap();
    doc.artifact
        .buildings
        .get_mut(&Building::MetalMine)
        .unwrap()
        .base[0] = 120;
    service.apply(&doc).await.unwrap();
    store.set_test_time(before.0).await.unwrap();
    assert!(matches!(
        game.step(u, WorkerId(Uuid::new_v4())).await.unwrap(),
        StepOutcome::Committed { .. }
    ));
    let after: (i64, serde_json::Value, String, String) = sqlx::query_as(
        "SELECT due_at,paid,profile_hash,status FROM constructions WHERE universe=$1",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((after.0, after.1, after.2), before);
    assert_eq!(after.3, "Completed");
    let active = store.load_rules(u).await.unwrap();
    let profiles:(String,String)=sqlx::query_as("SELECT input->>'profile_hash',facts->>'profile_hash' FROM transition_journal WHERE universe=$1 ORDER BY cursor DESC LIMIT 1").bind(u.0).fetch_one(&pool).await.unwrap();
    assert_ne!(profiles.0, active.hash.0);
    assert_eq!(profiles.1, active.hash.0);
}

#[tokio::test]
async fn unsafe_numeric_proposals_do_not_change_rules_even_without_players() {
    let (store, pool, _, _) = setup().await;
    let u = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(5),
                positions_per_system: None,
            },
            Some(45),
        )
        .await
        .unwrap()
        .universe;
    let service = RulesService::new(store.clone());
    let before = service.export(u).await.unwrap();
    for combat in [true, false] {
        let mut doc = before.clone();
        if combat {
            doc.artifact.world.as_mut().unwrap().combat.technology_bonus = [1, 3];
        } else {
            doc.artifact.temperature = [1, -1, 1, 100];
        }
        assert!(matches!(
            service.diff(&doc).await,
            Err(RulesUpdateError::Invalid { .. })
        ));
        assert!(matches!(
            service.apply(&doc).await,
            Err(RulesUpdateError::Invalid { .. })
        ));
    }
    assert_eq!(service.export(u).await.unwrap().artifact, before.artifact);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM rules_activations WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn signup_at_temperature_boundary_remains_playable_after_activation() {
    let (store, pool, _, _) = setup().await;
    let u = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(5),
                positions_per_system: None,
            },
            Some(45),
        )
        .await
        .unwrap()
        .universe;
    let epoch = Epoch(
        sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
    );
    let profile = store
        .load_rules(u)
        .await
        .unwrap()
        .artifact
        .universe
        .unwrap();
    // Select deterministic creation evidence for the hottest permitted homeworld.
    let seed = (0u32..10000)
        .find_map(|n| {
            let mut seed = [0u8; 32];
            seed[..4].copy_from_slice(&n.to_le_bytes());
            (balanced_homeworld(&seed, u, epoch, &profile, 0, &[], &[])
                .unwrap()
                .max_temperature
                == 110)
                .then_some(seed)
        })
        .expect("boundary seed");
    sqlx::query("UPDATE mvp_bootstraps SET secret=$2 WHERE universe=$1")
        .bind(u.0)
        .bind(seed.as_slice())
        .execute(&pool)
        .await
        .unwrap();
    let service = RulesService::new(store.clone());
    let mut doc = service.export(u).await.unwrap();
    doc.artifact.temperature = [110, -1, 1, 1];
    service.apply(&doc).await.unwrap();
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("hot{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let player = auth.session.memberships[0].player;
    let temperature: i32 = sqlx::query_scalar("SELECT max_temperature FROM bodies WHERE owner=$1")
        .bind(player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(temperature, 110);
    assert!(
        GameService::new(store)
            .initial_game(&auth.session, Uuid::new_v4())
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn impulse_activation_initializes_existing_and_new_players_and_survives_restart() {
    let (store, pool, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    let before = service.export(universe).await.unwrap();
    let mut document = before.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/impulse-drive.json"))
            .unwrap();
    document
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .insert(
            ResearchId::ImpulseDrive,
            serde_json::from_value(content["research"].clone()).unwrap(),
        );
    let entry = document
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    document
        .artifact
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .impulse_drive = Some(serde_json::from_value(content["small_cargo"].clone()).unwrap());
    assert_eq!(
        service
            .diff(&document)
            .await
            .unwrap()
            .initialize
            .add_research,
        vec![ResearchId::ImpulseDrive]
    );
    assert!(
        !store
            .load_rules(universe)
            .await
            .unwrap()
            .research_keys()
            .contains(&ResearchId::ImpulseDrive)
    );
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(snapshot.state.epoch, binding.epoch);
    assert_eq!(
        snapshot.state.research[&binding.player].levels[&ResearchId::ImpulseDrive],
        0
    );
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("impulse{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let player = joined.session.memberships[0].player;
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='ImpulseDrive'",
    )
    .bind(player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    let saved = store.load_rules(universe).await.unwrap();
    drop(store.server_guard_config(None).await.unwrap());
    assert_eq!(store.load_rules(universe).await.unwrap(), saved);
    // Disable further research without deleting definitions, levels or earned bonuses.
    let mut disabled = service.export(universe).await.unwrap();
    disabled
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::ImpulseDrive))
        .unwrap()
        .enabled = false;
    assert!(matches!(
        service.apply(&disabled).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM research_levels WHERE owner=$1 AND research='ImpulseDrive'",
    )
    .bind(binding.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    let mut destructive = service.export(universe).await.unwrap();
    destructive.artifact = before.artifact;
    assert!(service.diff(&destructive).await.is_err());
}

#[tokio::test]
async fn astrophysics_activation_is_additive_idempotent_and_preserves_research_on_disable() {
    let (store, pool, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    let mut impulse = service.export(universe).await.unwrap();
    let apply_content = |artifact: &mut RulesArtifact, id: ResearchId, bytes: &[u8]| {
        let content: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        artifact.progression.as_mut().unwrap().research.insert(
            id,
            serde_json::from_value(content["research"].clone()).unwrap(),
        );
        let entry = artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(id))
            .unwrap();
        entry.enabled = true;
        entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    };
    apply_content(
        &mut impulse.artifact,
        ResearchId::ImpulseDrive,
        include_bytes!("../../../rules/content/impulse-drive.json"),
    );
    let impulse_content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/impulse-drive.json"))
            .unwrap();
    impulse
        .artifact
        .ships
        .get_mut(&ShipType::SmallCargo)
        .unwrap()
        .impulse_drive =
        Some(serde_json::from_value(impulse_content["small_cargo"].clone()).unwrap());
    assert!(matches!(
        service.apply(&impulse).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    let before = service.export(universe).await.unwrap();
    let (old_snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let mut astro = before.clone();
    apply_content(
        &mut astro.artifact,
        ResearchId::Astrophysics,
        include_bytes!("../../../rules/content/astrophysics.json"),
    );
    let diff = service.diff(&astro).await.unwrap();
    assert_eq!(diff.initialize.add_research, vec![ResearchId::Astrophysics]);
    assert!(
        !store
            .load_rules(universe)
            .await
            .unwrap()
            .research_keys()
            .contains(&ResearchId::Astrophysics)
    );
    assert!(matches!(
        service.apply(&astro).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&astro).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(snapshot.state.epoch, binding.epoch);
    let mut expected_bodies = old_snapshot.state.bodies.clone();
    // Activation settles each body and advances its revision even at the same clock.
    for body in expected_bodies.values_mut() {
        body.revision += 1;
    }
    assert_eq!(snapshot.state.bodies, expected_bodies);
    let mut expected = old_snapshot.state.research[&binding.player].levels.clone();
    expected.insert(ResearchId::Astrophysics, 0);
    assert_eq!(snapshot.state.research[&binding.player].levels, expected);
    assert!(
        snapshot.state.research[&binding.player].revision
            > old_snapshot.state.research[&binding.player].revision
    );
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("astro{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='Astrophysics'",
    )
    .bind(joined.session.memberships[0].player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    let saved = store.load_rules(universe).await.unwrap();
    drop(store.server_guard_config(None).await.unwrap());
    assert_eq!(store.load_rules(universe).await.unwrap(), saved);
    // Disposable completed-research fixture includes the mandatory paid-value
    // lineage for each level; a bare level edit is correctly rejected as corrupt.
    let mut transaction = pool.begin().await.unwrap();
    sqlx::query("UPDATE research_levels SET level=5 WHERE owner=$1 AND research='Astrophysics'")
        .bind(binding.player.0)
        .execute(&mut *transaction)
        .await
        .unwrap();
    let mut lots = Vec::new();
    for (index, paid) in [16_000, 28_000, 49_100, 85_700, 150_000]
        .into_iter()
        .enumerate()
    {
        let id = OperationId(Uuid::new_v4());
        let lot = AssetLot {
            id,
            owner: binding.player,
            item: CatalogKey::Research(ResearchId::Astrophysics),
            level: Some(index as u32 + 1),
            location: AssetLocation::Player,
            quantity: 1,
            unit_value_micro: paid * SCALE,
            rules_hash: saved.hash.clone(),
            source_operation: id,
            acquired_at: 1000,
            acquired_sequence: index as i64,
        };
        sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
            .bind(universe.0)
            .bind(id.to_string())
            .bind(sqlx::types::Json(&lot))
            .execute(&mut *transaction)
            .await
            .unwrap();
        lots.push(lot);
    }
    transaction.commit().await.unwrap();
    let (completed, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(
        completed.state.research[&binding.player].levels[&ResearchId::Astrophysics],
        5
    );
    let mut disabled = service.export(universe).await.unwrap();
    disabled
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::Astrophysics))
        .unwrap()
        .enabled = false;
    assert!(matches!(
        service.apply(&disabled).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    let levels: Vec<i64> = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='Astrophysics'",
    )
    .bind(binding.player.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(levels, vec![5]);
    let (disabled_snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let actual_lots = &disabled_snapshot.state.world.as_ref().unwrap().records.lots;
    assert_eq!(actual_lots.len(), lots.len());
    for lot in lots {
        assert!(actual_lots.contains(&lot));
    }
    let mut destructive = service.export(universe).await.unwrap();
    destructive.artifact = before.artifact;
    assert!(service.diff(&destructive).await.is_err());
}

#[tokio::test]
async fn light_laser_activation_initializes_research_and_preserves_players_across_restart() {
    let (store, pool, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    let before = service.export(universe).await.unwrap();
    let (old_snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let mut document = before.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/light-laser.json")).unwrap();
    let progression = document.artifact.progression.as_mut().unwrap();
    progression.research.insert(
        ResearchId::LaserTechnology,
        serde_json::from_value(content["research"]["definition"].clone()).unwrap(),
    );
    progression.unit_costs.push(UnitCost {
        item: ManufacturedItem::Defense(DefenseId::LightLaser),
        cost: serde_json::from_value(content["defense"]["cost"].clone()).unwrap(),
    });
    document
        .artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .push(serde_json::from_value(content["defense"]["combat"].clone()).unwrap());
    for (key, section) in [
        (
            CatalogKey::Research(ResearchId::LaserTechnology),
            "research",
        ),
        (CatalogKey::Defense(DefenseId::LightLaser), "defense"),
    ] {
        let entry = document
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == key)
            .unwrap();
        entry.enabled = true;
        entry.requirements =
            serde_json::from_value(content[section]["requirements"].clone()).unwrap();
    }
    let diff = service.diff(&document).await.unwrap();
    assert_eq!(
        diff.initialize.add_research,
        vec![ResearchId::LaserTechnology]
    );
    assert!(diff.initialize.add_buildings.is_empty());
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(snapshot.state.epoch, binding.epoch);
    let mut expected = old_snapshot.state.research[&binding.player].levels.clone();
    expected.insert(ResearchId::LaserTechnology, 0);
    assert_eq!(snapshot.state.research[&binding.player].levels, expected);
    let mut bodies = old_snapshot.state.bodies.clone();
    for body in bodies.values_mut() {
        body.revision += 1;
    }
    assert_eq!(snapshot.state.bodies, bodies);
    assert_eq!(snapshot.state.inventories, old_snapshot.state.inventories);
    assert_eq!(
        snapshot.state.manufacturing_batches,
        old_snapshot.state.manufacturing_batches
    );
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("laser{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let new_player = joined.session.memberships[0].player;
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='LaserTechnology'",
    )
    .bind(new_player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    let saved = store.load_rules(universe).await.unwrap();
    drop(store.server_guard_config(None).await.unwrap());
    assert_eq!(store.load_rules(universe).await.unwrap(), saved);
    assert!(
        saved
            .artifact
            .catalog
            .iter()
            .any(|e| e.key == CatalogKey::Defense(DefenseId::LightLaser) && e.enabled)
    );
    // Stop future orders without deleting research, inventory or combat definitions.
    let mut disabled = service.export(universe).await.unwrap();
    for key in [
        CatalogKey::Defense(DefenseId::LightLaser),
        CatalogKey::Research(ResearchId::LaserTechnology),
    ] {
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == key)
            .unwrap()
            .enabled = false;
    }
    service.apply(&disabled).await.unwrap();
    let (after, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(after.state.research[&binding.player].levels, expected);
    let mut destructive = service.export(universe).await.unwrap();
    destructive.artifact = before.artifact;
    assert!(service.diff(&destructive).await.is_err());
}

#[tokio::test]
async fn ion_activation_preserves_players_and_initializes_new_signups() {
    let (store, pool, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    // Establish Laser independently, as the Ion preparation tool requires.
    let mut laser = service.export(universe).await.unwrap();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/light-laser.json")).unwrap();
    laser
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .insert(
            ResearchId::LaserTechnology,
            serde_json::from_value(content["research"]["definition"].clone()).unwrap(),
        );
    let entry = laser
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::LaserTechnology))
        .unwrap();
    entry.enabled = true;
    entry.requirements =
        serde_json::from_value(content["research"]["requirements"].clone()).unwrap();
    service.apply(&laser).await.unwrap();
    let before = service.export(universe).await.unwrap();
    let (old, _) = store.bound_world(binding).await.unwrap().facts;
    let mut document = before.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/ion-technology.json"))
            .unwrap();
    document
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .research
        .insert(
            ResearchId::IonTechnology,
            serde_json::from_value(content["research"].clone()).unwrap(),
        );
    let entry = document
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    let diff = service.diff(&document).await.unwrap();
    assert_eq!(
        diff.initialize.add_research,
        vec![ResearchId::IonTechnology]
    );
    assert!(diff.initialize.add_buildings.is_empty());
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let mut expected = old.state.research[&binding.player].levels.clone();
    expected.insert(ResearchId::IonTechnology, 0);
    assert_eq!(snapshot.state.research[&binding.player].levels, expected);
    assert_eq!(snapshot.state.epoch, binding.epoch);
    let mut bodies = old.state.bodies.clone();
    for body in bodies.values_mut() {
        body.revision += 1;
    }
    assert_eq!(snapshot.state.bodies, bodies);
    assert_eq!(snapshot.state.inventories, old.state.inventories);
    assert_eq!(
        snapshot.state.manufacturing_batches,
        old.state.manufacturing_batches
    );
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("ion{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let player = joined.session.memberships[0].player;
    let level: i64 = sqlx::query_scalar(
        "SELECT level FROM research_levels WHERE owner=$1 AND research='IonTechnology'",
    )
    .bind(player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(level, 0);
    let saved = store.load_rules(universe).await.unwrap();
    drop(store.server_guard_config(None).await.unwrap());
    assert_eq!(store.load_rules(universe).await.unwrap(), saved);
    let mut disabled = service.export(universe).await.unwrap();
    disabled
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Research(ResearchId::IonTechnology))
        .unwrap()
        .enabled = false;
    service.apply(&disabled).await.unwrap();
    let (after, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(after.state.research[&binding.player].levels, expected);
    let mut destructive = service.export(universe).await.unwrap();
    destructive.artifact = before.artifact;
    assert!(service.diff(&destructive).await.is_err());
}

#[tokio::test]
async fn beginner_protection_multiplier_is_saved_per_universe_and_can_be_reset() {
    let (store, _, universe, binding) = setup().await;
    let (_, _, other, _) = setup().await;
    let service = RulesService::new(store.clone());
    let other_rules = store.load_rules(other).await.unwrap();
    let original = store.load_rules(universe).await.unwrap();
    let mut document = service.export(universe).await.unwrap();
    document
        .artifact
        .world
        .as_mut()
        .unwrap()
        .beginner_protection_multiplier = 10;
    let diff = service.diff(&document).await.unwrap();
    assert_eq!(diff.changes.len(), 1);
    assert_eq!(diff.changes[0].after, Some(serde_json::json!(10)));
    assert_ne!(diff.current_hash, diff.proposed_hash);
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { revision: 1, .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { revision: 1, .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let rules = &snapshot.rules;
    assert_eq!(
        rules
            .artifact
            .world
            .as_ref()
            .unwrap()
            .beginner_protection_multiplier,
        10
    );
    assert_eq!(snapshot.state.profile_hash, rules.hash);
    assert_eq!(store.load_rules(other).await.unwrap(), other_rules);
    drop(store.server_guard_config(None).await.unwrap());
    let mut reset = service.export(universe).await.unwrap();
    assert_eq!(
        reset
            .artifact
            .world
            .as_ref()
            .unwrap()
            .beginner_protection_multiplier,
        10
    );
    reset
        .artifact
        .world
        .as_mut()
        .unwrap()
        .beginner_protection_multiplier = 5;
    assert!(matches!(
        service.apply(&reset).await.unwrap(),
        RulesApplyOutcome::Applied { revision: 2, .. }
    ));
    assert_eq!(store.load_rules(universe).await.unwrap(), original);
}

#[tokio::test]
async fn ion_cannon_activation_preserves_paid_work_and_retained_defenses_across_restart() {
    defense_activation_preserves_paid_work(DefenseId::IonCannon).await;
}

#[tokio::test]
async fn gauss_cannon_activation_preserves_paid_work_and_retained_defenses_across_restart() {
    defense_activation_preserves_paid_work(DefenseId::GaussCannon).await;
}

#[tokio::test]
async fn heavy_laser_activation_preserves_paid_work_and_retained_defenses_across_restart() {
    defense_activation_preserves_paid_work(DefenseId::HeavyLaser).await;
}

async fn defense_activation_preserves_paid_work(defense: DefenseId) {
    let (store, pool, universe, binding) = setup().await;
    let (_, _, other, _) = setup().await;
    let service = RulesService::new(store.clone());
    let other_rules = store.load_rules(other).await.unwrap();
    if matches!(defense, DefenseId::IonCannon | DefenseId::HeavyLaser) {
        let mut prerequisites = service.export(universe).await.unwrap();
        let fixture: RulesArtifact =
            serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-9.json")).unwrap();
        for research in [ResearchId::LaserTechnology, ResearchId::IonTechnology] {
            prerequisites
                .artifact
                .progression
                .as_mut()
                .unwrap()
                .research
                .insert(
                    research,
                    fixture.progression.as_ref().unwrap().research[&research].clone(),
                );
            let key = CatalogKey::Research(research);
            *prerequisites
                .artifact
                .catalog
                .iter_mut()
                .find(|e| e.key == key)
                .unwrap() = fixture
                .catalog
                .iter()
                .find(|e| e.key == key)
                .unwrap()
                .clone();
        }
        service.apply(&prerequisites).await.unwrap();
    }
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let body = *snapshot.state.bodies.keys().next().unwrap();
    sqlx::query("UPDATE bodies SET amounts=$2, revision=revision+1 WHERE id=$1")
        .bind(body.0)
        .bind(sqlx::types::Json(Resources::all(100_000 * SCALE)))
        .execute(&pool)
        .await
        .unwrap();

    // Completed facility/research fixtures need one paid-value lot per level.
    // A bare level edit is correctly rejected by the world lineage invariant.
    let levels = match defense {
        DefenseId::IonCannon => vec![
            (
                CatalogKey::Building(Building::Shipyard),
                AssetLocation::Body(body),
                700,
                4,
            ),
            (
                CatalogKey::Research(ResearchId::IonTechnology),
                AssetLocation::Player,
                1400,
                4,
            ),
        ],
        DefenseId::HeavyLaser => vec![
            (
                CatalogKey::Building(Building::Shipyard),
                AssetLocation::Body(body),
                700,
                4,
            ),
            (
                CatalogKey::Research(ResearchId::LaserTechnology),
                AssetLocation::Player,
                300,
                6,
            ),
            (
                CatalogKey::Research(ResearchId::EnergyTechnology),
                AssetLocation::Player,
                1200,
                3,
            ),
        ],
        DefenseId::GaussCannon => vec![
            (
                CatalogKey::Building(Building::Shipyard),
                AssetLocation::Body(body),
                700,
                6,
            ),
            (
                CatalogKey::Research(ResearchId::EnergyTechnology),
                AssetLocation::Player,
                1200,
                6,
            ),
            (
                CatalogKey::Research(ResearchId::WeaponsTechnology),
                AssetLocation::Player,
                1000,
                3,
            ),
            (
                CatalogKey::Research(ResearchId::ShieldingTechnology),
                AssetLocation::Player,
                800,
                1,
            ),
        ],
        _ => unreachable!(),
    };
    for (item, location, base_value, target_level) in levels {
        match item {
            CatalogKey::Building(building) => {
                sqlx::query("UPDATE building_levels SET level=$3 WHERE body=$1 AND building=$2")
                    .bind(body.0)
                    .bind(serde_json::to_value(building).unwrap().as_str().unwrap())
                    .bind(target_level as i32)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            CatalogKey::Research(research) => {
                sqlx::query("UPDATE research_levels SET level=$3 WHERE owner=$1 AND research=$2")
                    .bind(binding.player.0)
                    .bind(serde_json::to_value(research).unwrap().as_str().unwrap())
                    .bind(target_level as i32)
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            _ => unreachable!(),
        }
        for level in 1..=target_level {
            let id = OperationId(Uuid::new_v4());
            let lot = AssetLot {
                id,
                owner: binding.player,
                item,
                level: Some(level),
                location: location.clone(),
                quantity: 1,
                unit_value_micro: base_value * (1i64 << (level - 1)) * SCALE,
                rules_hash: snapshot.rules.hash.clone(),
                source_operation: id,
                acquired_at: 1000,
                acquired_sequence: i64::from(level),
            };
            sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
                .bind(universe.0)
                .bind(id.to_string())
                .bind(sqlx::types::Json(lot))
                .execute(&pool)
                .await
                .unwrap();
        }
    }

    async fn append(
        store: &PgStore,
        binding: Binding,
        body: BodyId,
        item: ManufacturedItem,
        quantity: i64,
    ) {
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &QuoteRequest::Manufacture {
                body,
                item,
                quantity,
            },
            1000,
            &snapshot.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        let command_id = CommandId(Uuid::new_v4());
        store
            .bound_admit4(ForegroundAction {
                gameplay: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id,
                    command: CommandDto3::Progression(Command::StartManufacture {
                        body,
                        item,
                        quantity,
                        expected_terms_hash: quote.terms_hash.unwrap(),
                    }),
                },
                presence: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: Some(body),
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: Some(command_id),
                        },
                    }),
                },
            })
            .await
            .unwrap();
        let game = GameService::new(store.clone());
        for _ in 0..10 {
            if matches!(
                game.step(binding.universe, WorkerId(Uuid::new_v4()))
                    .await
                    .unwrap(),
                StepOutcome::Idle
            ) {
                break;
            }
        }
        let receipt = game
            .receipt(Actor::Player(binding.player), binding.universe, command_id)
            .await
            .unwrap();
        assert!(
            matches!(receipt.status, ReceiptStatus::Committed { .. }),
            "{:?}",
            receipt.status
        );
    }
    append(
        &store,
        binding,
        body,
        ManufacturedItem::Defense(DefenseId::RocketLauncher),
        1,
    )
    .await;
    let (before, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(before.state.manufacturing_batches.len(), 1);
    let mut document = service.export(universe).await.unwrap();
    let content: serde_json::Value = serde_json::from_slice(match defense {
        DefenseId::IonCannon => include_bytes!("../../../rules/content/ion-cannon.json").as_slice(),
        DefenseId::HeavyLaser => {
            include_bytes!("../../../rules/content/heavy-laser.json").as_slice()
        }
        DefenseId::GaussCannon => {
            include_bytes!("../../../rules/content/gauss-cannon.json").as_slice()
        }
        _ => unreachable!(),
    })
    .unwrap();
    let item = ManufacturedItem::Defense(defense);
    let entry = document
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    document
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item,
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    document
        .artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .push(serde_json::from_value(content["combat"].clone()).unwrap());
    let diff = service.diff(&document).await.unwrap();
    assert!(diff.initialize.add_research.is_empty());
    assert!(diff.initialize.add_buildings.is_empty());
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (after, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(after.state.epoch, before.state.epoch);
    assert_eq!(after.state.research, before.state.research);
    assert_eq!(after.state.inventories, before.state.inventories);
    assert_eq!(
        after.state.manufacturing_batches,
        before.state.manufacturing_batches
    );
    assert_eq!(
        after.state.bodies[&body].checkpoint.amounts,
        before.state.bodies[&body].checkpoint.amounts
    );
    assert_eq!(store.load_rules(other).await.unwrap(), other_rules);
    append(&store, binding, body, item, 3).await;
    let (paid, _) = store.bound_world(binding).await.unwrap().facts;
    let batch = paid
        .state
        .manufacturing_batches
        .values()
        .find(|b| b.item == item)
        .unwrap()
        .clone();
    let mut disabled = service.export(universe).await.unwrap();
    disabled
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == item.catalog_key())
        .unwrap()
        .enabled = false;
    service.apply(&disabled).await.unwrap();
    let saved = store.load_rules(universe).await.unwrap();
    let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    drop(restarted.server_guard_config(None).await.unwrap());
    assert_eq!(restarted.load_rules(universe).await.unwrap(), saved);
    restarted.set_test_time(batch.final_due_at).await.unwrap();
    let game = GameService::new(restarted.clone());
    for _ in 0..10 {
        if matches!(
            game.step(universe, WorkerId(Uuid::new_v4())).await.unwrap(),
            StepOutcome::Idle
        ) {
            break;
        }
    }
    let (complete, _) = restarted.bound_world(binding).await.unwrap().facts;
    assert_eq!(
        complete
            .state
            .inventories
            .iter()
            .find(|v| v.item == item && v.body == body)
            .unwrap()
            .count,
        3
    );
    assert!(!complete.state.manufacturing_batches.contains_key(&batch.id));
    let sqlx::types::Json(completed_batch): sqlx::types::Json<ManufacturingBatch> =
        sqlx::query_scalar("SELECT data FROM manufacturing_batches WHERE universe=$1 AND id=$2")
            .bind(universe.0)
            .bind(batch.id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(completed_batch.status, ManufacturingStatus::Completed);
    assert_eq!(completed_batch.commitment, batch.commitment);
    assert_eq!(completed_batch.unit_duration_ms, batch.unit_duration_ms);
    assert_eq!(
        complete.state.bodies[&body].checkpoint.amounts,
        paid.state.bodies[&body].checkpoint.amounts
    );
    assert!(
        inspect_progression(
            &complete.state,
            Actor::Player(binding.player),
            &QuoteRequest::Manufacture {
                body,
                item,
                quantity: 1
            },
            batch.final_due_at,
            &complete.rules
        )
        .unwrap()
        .blockers
        .iter()
        .any(|b| b.code == GameError::UnavailableContent)
    );
    let mut destructive = service.export(universe).await.unwrap();
    destructive
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .retain(|u| u.item != item);
    destructive
        .artifact
        .world
        .as_mut()
        .unwrap()
        .combat
        .units
        .retain(|u| u.item != item);
    assert!(service.diff(&destructive).await.is_err());
    assert_eq!(store.load_rules(other).await.unwrap(), other_rules);
}

#[tokio::test]
async fn cruiser_activation_preserves_players_and_survives_restart_and_disable() {
    let (store, _, universe, binding) = setup().await;
    let service = RulesService::new(store.clone());
    let mut prerequisites = service.export(universe).await.unwrap();
    let profile = prerequisites.artifact.universe.clone();
    prerequisites.artifact =
        serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-9.json")).unwrap();
    prerequisites.artifact.universe = profile;
    service.apply(&prerequisites).await.unwrap();
    let before = service.export(universe).await.unwrap();
    let (old, _) = store.bound_world(binding).await.unwrap().facts;
    let mut document = before.clone();
    let content: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../../rules/content/cruiser.json")).unwrap();
    document.artifact.ships.insert(
        ShipType::Cruiser,
        serde_json::from_value(content["ship"].clone()).unwrap(),
    );
    document
        .artifact
        .progression
        .as_mut()
        .unwrap()
        .unit_costs
        .push(UnitCost {
            item: ManufacturedItem::Ship(ShipType::Cruiser),
            cost: serde_json::from_value(content["cost"].clone()).unwrap(),
        });
    let combat = &mut document.artifact.world.as_mut().unwrap().combat;
    combat
        .units
        .push(serde_json::from_value(content["combat"].clone()).unwrap());
    combat
        .rapid_fire
        .extend(serde_json::from_value::<Vec<RapidFire>>(content["rapid_fire"].clone()).unwrap());
    let entry = document
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::Cruiser))
        .unwrap();
    entry.enabled = true;
    entry.requirements = serde_json::from_value(content["requirements"].clone()).unwrap();
    let diff = service.diff(&document).await.unwrap();
    assert!(diff.initialize.add_research.is_empty());
    assert!(diff.initialize.add_buildings.is_empty());
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::Applied { .. }
    ));
    assert!(matches!(
        service.apply(&document).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    assert_eq!(
        snapshot.state.research[&binding.player].levels,
        old.state.research[&binding.player].levels
    );
    assert_eq!(snapshot.state.epoch, binding.epoch);
    let mut bodies = old.state.bodies.clone();
    for body in bodies.values_mut() {
        body.revision += 1;
    }
    assert_eq!(snapshot.state.bodies, bodies);
    assert_eq!(snapshot.state.inventories, old.state.inventories);
    assert_eq!(
        snapshot.state.manufacturing_batches,
        old.state.manufacturing_batches
    );
    let saved = store.load_rules(universe).await.unwrap();
    assert_eq!(
        saved.artifact.ships[&ShipType::Cruiser].drive,
        Some(ResearchId::ImpulseDrive)
    );
    drop(store.server_guard_config(None).await.unwrap());
    assert_eq!(store.load_rules(universe).await.unwrap(), saved);
    let joined = SessionService::new(store.clone())
        .signup(
            &format!("cruiser{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe,
                max_players: 45,
            },
            None,
        )
        .await
        .unwrap();
    let joined_binding = GameService::new(store.clone())
        .current_binding(joined.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let (new_player, _) = store.bound_world(joined_binding).await.unwrap().facts;
    assert_eq!(new_player.rules, saved);
    assert_eq!(
        new_player.state.research[&joined_binding.player].levels[&ResearchId::IonTechnology],
        0
    );
    assert_eq!(
        new_player.state.research[&joined_binding.player].levels[&ResearchId::ImpulseDrive],
        0
    );
    assert!(
        !new_player
            .state
            .inventories
            .iter()
            .any(|i| i.item == ManufacturedItem::Ship(ShipType::Cruiser))
    );
    let mut disabled = service.export(universe).await.unwrap();
    disabled
        .artifact
        .catalog
        .iter_mut()
        .find(|e| e.key == CatalogKey::Ship(ShipType::Cruiser))
        .unwrap()
        .enabled = false;
    service.apply(&disabled).await.unwrap();
    let retained = store.load_rules(universe).await.unwrap();
    assert_eq!(retained.artifact.ships, saved.artifact.ships);
    assert_eq!(
        retained.artifact.world.as_ref().unwrap().combat,
        saved.artifact.world.as_ref().unwrap().combat
    );
    let mut destructive = service.export(universe).await.unwrap();
    destructive.artifact = before.artifact;
    assert!(service.diff(&destructive).await.is_err());
}

#[tokio::test]
async fn satellites_settle_inventory_at_completions_and_rules_boundaries_in_both_runtimes() {
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
        let service = RulesService::new(store.clone());
        let mut doc = service.export(universe).await.unwrap();
        let profile = doc.artifact.universe.clone();
        doc.artifact =
            serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-solar-satellite.json"))
                .unwrap();
        doc.artifact.universe = profile;
        service.apply(&doc).await.unwrap();
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let body = *snapshot.state.bodies.keys().next().unwrap();
        // Deterministic completed industry fixture, with matching authoritative value lots.
        for (building, cost) in [
            (Building::Shipyard, 700),
            (Building::MetalMine, 90),
            (Building::CrystalMine, 72),
        ] {
            sqlx::query("UPDATE building_levels SET level=1 WHERE body=$1 AND building=$2")
                .bind(body.0)
                .bind(format!("{building:?}"))
                .execute(&pool)
                .await
                .unwrap();
            let id = OperationId(Uuid::new_v4());
            let lot = AssetLot {
                id,
                owner: binding.player,
                item: CatalogKey::Building(building),
                level: Some(1),
                location: AssetLocation::Body(body),
                quantity: 1,
                unit_value_micro: cost * SCALE,
                rules_hash: snapshot.rules.hash.clone(),
                source_operation: id,
                acquired_at: 1000,
                acquired_sequence: 0,
            };
            sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
                .bind(universe.0)
                .bind(id.to_string())
                .bind(sqlx::types::Json(lot))
                .execute(&pool)
                .await
                .unwrap();
        }
        sqlx::query(
            "UPDATE bodies SET max_temperature=40, amounts=$2, revision=revision+1 WHERE id=$1",
        )
        .bind(body.0)
        .bind(sqlx::types::Json(Resources::from_values([
            0,
            5000 * SCALE,
            1000 * SCALE,
        ])))
        .execute(&pool)
        .await
        .unwrap();
        if scoped {
            store.prepare_scoped_runtime(universe, 100).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let item = ManufacturedItem::Ship(ShipType::SolarSatellite);
        let q = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &QuoteRequest::Manufacture {
                body,
                item,
                quantity: 2,
            },
            1000,
            &snapshot.rules,
        )
        .unwrap();
        assert!(q.blockers.is_empty());
        let id = CommandId(Uuid::new_v4());
        store
            .bound_admit4(ForegroundAction {
                gameplay: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: id,
                    command: CommandDto3::Progression(Command::StartManufacture {
                        body,
                        item,
                        quantity: 2,
                        expected_terms_hash: q.terms_hash.unwrap(),
                    }),
                },
                presence: CommandEnvelopeV4 {
                    protocol: 4,
                    binding,
                    command_id: CommandId(Uuid::new_v4()),
                    command: CommandDto3::Progression(Command::World {
                        action: WorldAction::RecordForegroundPresence {
                            body: Some(body),
                            cause: PresenceCause::GameplayGesture,
                            paired_command_id: Some(id),
                        },
                    }),
                },
            })
            .await
            .unwrap();
        async fn drain(store: &PgStore, u: UniverseId, scoped: bool) {
            let game = GameService::new(store.clone());
            for _ in 0..20 {
                let outcome = if scoped {
                    game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                        .await
                        .unwrap()
                } else {
                    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap()
                };
                if matches!(outcome, StepOutcome::Idle) {
                    return;
                }
            }
            panic!("unbounded satellite work");
        }
        drain(&store, universe, scoped).await;
        assert!(matches!(
            store.bound_receipt(binding, id).await.unwrap().status,
            ReceiptStatus::Committed { .. }
        ));
        let (paid, _) = store.bound_world(binding).await.unwrap().facts;
        let batch = paid
            .state
            .manufacturing_batches
            .values()
            .find(|b| b.item == item)
            .unwrap()
            .clone();
        store.set_test_time(batch.next_due_at).await.unwrap();
        drain(&store, universe, scoped).await;
        let (first, _) = store.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            solar_satellite_count(&first.state, &first.state.bodies[&body], &first.rules).unwrap(),
            1
        );
        assert_eq!(
            first.state.bodies[&body].checkpoint.amounts.metal,
            12 * SCALE
        );
        // Activate a new energy coefficient halfway to the next completion. This
        // exercises old inventory-aware rates at the activation boundary.
        store
            .set_test_time(batch.next_due_at + 72_000)
            .await
            .unwrap();
        let mut next = service.export(universe).await.unwrap();
        next.artifact
            .progression
            .as_mut()
            .unwrap()
            .solar_satellite
            .as_mut()
            .unwrap()
            .temperature_offset = 146;
        next.artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == item.catalog_key())
            .unwrap()
            .enabled = false;
        match service.apply(&next).await {
            Ok(RulesApplyOutcome::Applied { .. }) => {}
            Err(RulesUpdateError::Pending { .. }) if scoped => {
                assert!(store.process_runtime_barrier(universe).await.unwrap());
            }
            other => panic!("unexpected satellite activation: {other:?}"),
        }
        let (boundary, _) = store.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            boundary.state.bodies[&body].checkpoint.amounts.metal,
            24_600_000
        );
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        restarted.set_test_time(batch.final_due_at).await.unwrap();
        drain(&restarted, universe, scoped).await;
        let (completed, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            completed.state.bodies[&body].checkpoint.amounts.metal,
            37_200_000
        );
        assert_eq!(
            solar_satellite_count(
                &completed.state,
                &completed.state.bodies[&body],
                &completed.rules
            )
            .unwrap(),
            2
        );
        validate_asset_lineage(&completed.state).unwrap();
        let view = GameService::new(restarted)
            .world_view(
                Principal {
                    account: binding.account,
                    player: binding.player,
                    universe,
                },
                QueryContext {
                    binding,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let production = view
            .progression
            .progression
            .production
            .iter()
            .find(|p| p.body == body)
            .unwrap();
        assert_eq!(production.energy_supply, "62000000");
        let output = production.solar_satellite.as_ref().unwrap();
        assert_eq!(output.unit_energy, "31000000");
        assert_eq!(output.energy_supply, "62000000");
        assert!(production.editable.iter().any(|k| k == "solar_satellite"));
        assert_eq!(production.gross_per_hour.metal, "630000000");
    }
}
