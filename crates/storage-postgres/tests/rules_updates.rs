use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

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
