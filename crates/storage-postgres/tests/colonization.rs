use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

async fn enroll(store: &PgStore, u: UniverseId) -> Binding {
    let auth = SessionService::new(store.clone())
        .signup(
            &format!("colony{}", Uuid::new_v4().simple()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 9,
            },
            None,
        )
        .await
        .unwrap();
    GameService::new(store.clone())
        .current_binding(auth.session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding
}
async fn setup() -> (PgStore, PgPool, Binding, Binding) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let u = store
        .ensure_signup_universe(
            Some(UniverseId(Uuid::new_v4())),
            UniverseOptions {
                galaxies: Some(1),
                systems_per_galaxy: Some(1),
                positions_per_system: None,
            },
            Some(9),
        )
        .await
        .unwrap()
        .universe;
    let first = enroll(&store, u).await;
    let service = RulesService::new(store.clone());
    let mut doc = service.export(u).await.unwrap();
    let old = doc.artifact.clone();
    let mut artifact: RulesArtifact =
        serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-6.json")).unwrap();
    artifact.universe = old.universe.clone();
    doc.artifact = artifact;
    let diff = service.diff(&doc).await.unwrap();
    assert_eq!(diff.initialize.add_research.len(), 2);
    service.apply(&doc).await.unwrap();
    assert!(matches!(
        service.apply(&doc).await.unwrap(),
        RulesApplyOutcome::AlreadyActive { .. }
    ));
    let second = enroll(&store, u).await;
    for b in [first, second] {
        let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
        assert_eq!(
            snapshot.state.research[&b.player].levels[&ResearchId::Astrophysics],
            0
        );
        assert_eq!(
            snapshot.state.research[&b.player].levels[&ResearchId::ImpulseDrive],
            0
        );
        assert_eq!(
            snapshot
                .state
                .bodies
                .values()
                .next()
                .unwrap()
                .checkpoint
                .amounts
                .metal,
            1000 * SCALE
        );
    }
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    (store, pool, first, second)
}
async fn equip(store: &PgStore, pool: &PgPool, b: Binding) -> BodyId {
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let mut state = snapshot.state;
    let rules = snapshot.rules;
    let body = state.bodies.values().next().unwrap().clone();
    for (key, value) in [
        (ResearchId::ImpulseDrive, 3),
        (ResearchId::Astrophysics, 1),
        (ResearchId::ComputerTechnology, 3),
    ] {
        for n in 1..=value {
            state
                .research
                .get_mut(&b.player)
                .unwrap()
                .levels
                .insert(key, n - 1);
            let paid = research_terms(&body, &state.research[&b.player], key, &rules)
                .unwrap()
                .paid();
            let id = OperationId(Uuid::new_v4());
            let lot = AssetLot {
                id,
                owner: b.player,
                item: CatalogKey::Research(key),
                level: Some(n),
                location: AssetLocation::Player,
                quantity: 1,
                unit_value_micro: paid.values().iter().sum(),
                rules_hash: rules.hash.clone(),
                source_operation: id,
                acquired_at: 1000,
                acquired_sequence: 0,
            };
            sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
                .bind(b.universe.0)
                .bind(id.to_string())
                .bind(sqlx::types::Json(lot))
                .execute(pool)
                .await
                .unwrap();
        }
        sqlx::query("UPDATE research_levels SET level=$3 WHERE owner=$1 AND research=$2")
            .bind(b.player.0)
            .bind(format!("{key:?}"))
            .bind(i64::from(value))
            .execute(pool)
            .await
            .unwrap();
    }
    let id = OperationId(Uuid::new_v4());
    let item = ManufacturedItem::Ship(ShipType::ColonyShip);
    let lot = AssetLot {
        id,
        owner: b.player,
        item: CatalogKey::Ship(ShipType::ColonyShip),
        level: None,
        location: AssetLocation::Body(body.id),
        quantity: 3,
        unit_value_micro: 40000 * SCALE,
        rules_hash: rules.hash.clone(),
        source_operation: id,
        acquired_at: 1000,
        acquired_sequence: 0,
    };
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
        .bind(b.universe.0)
        .bind(id.to_string())
        .bind(sqlx::types::Json(lot))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,3,0)")
        .bind(body.id.0)
        .bind(b.player.0)
        .bind(sqlx::types::Json(item))
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("UPDATE bodies SET amounts=$2 WHERE id=$1")
        .bind(body.id.0)
        .bind(sqlx::types::Json(Resources::all(100000 * SCALE)))
        .execute(pool)
        .await
        .unwrap();
    body.id
}
async fn empty(store: &PgStore, b: Binding) -> Coordinates {
    let (snapshot, _) = store
        .bound_world_query(
            b,
            WorldQueryKind::Galaxy {
                galaxy: 1,
                system: 1,
            },
        )
        .await
        .unwrap()
        .facts;
    snapshot
        .state
        .world
        .unwrap()
        .planet_slots
        .into_iter()
        .find(|slot| (4..=12).contains(&slot.coordinates.position) && slot.occupant.is_none())
        .unwrap()
        .coordinates
}
async fn launch(
    store: &PgStore,
    b: Binding,
    origin: BodyId,
    coordinates: Coordinates,
    count: i64,
) -> MissionFleet {
    let (snapshot, _) = store
        .bound_world_query(
            b,
            WorldQueryKind::ResolveDestination {
                selection: DestinationSelection::EmptyPositionAt { coordinates },
            },
        )
        .await
        .unwrap()
        .facts;
    let destination = resolve_destination(
        &snapshot.state,
        DestinationSelection::EmptyPositionAt { coordinates },
        &snapshot.rules,
    )
    .unwrap();
    let intent = FleetIntent {
        origin,
        destination,
        mission: Mission::Colonize,
        ships: vec![ManifestStack {
            owner: b.player,
            ship_type: ShipType::ColonyShip,
            count,
        }],
        cargo: Resources::from_values([1000 * SCALE, 0, 0]),
        speed_percent: 100,
    };
    let (snapshot, _) = store
        .bound_world_query(
            b,
            WorldQueryKind::FleetQuote {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts;
    let q = quote_fleet(
        &snapshot.state,
        b.player,
        &intent,
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    let id = CommandId(Uuid::new_v4());
    let pair = ForegroundAction {
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(origin),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(id),
                },
            }),
        },
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: id,
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::LaunchFleet {
                    intent,
                    expected_terms_hash: q.terms_hash.clone(),
                },
            }),
        },
    };
    store.bound_admit4(pair.clone()).await.unwrap();
    store.bound_admit4(pair).await.unwrap();
    let game = GameService::new(store.clone());
    for _ in 0..2 {
        assert!(matches!(
            game.step_scoped(b.universe, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Committed { .. }
        ));
    }
    let receipt = store.bound_receipt(b, id).await.unwrap();
    assert!(
        matches!(receipt.status, ReceiptStatus::Committed { .. }),
        "{receipt:?}"
    );
    let (snapshot, _) = store.bound_world(b).await.unwrap().facts;
    let ReceiptStatus::Committed { result_ids, .. } = receipt.status else {
        panic!("launch committed")
    };
    let fleet_id = FleetId(Uuid::parse_str(&result_ids[0]).unwrap());
    snapshot.state.world.unwrap().records.fleets[&fleet_id].clone()
}
async fn due(store: &PgStore, u: UniverseId) -> (ScopedClaim, ClaimSnapshot, TransitionResult) {
    let claim = store
        .claim_scoped(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_scoped(&claim).await.unwrap();
    let result = transition(&facts.state, &claim.input, &facts.rules);
    assert!(matches!(result, TransitionResult::Applied(_)), "{result:?}");
    (claim, facts, result)
}
#[tokio::test]
async fn colony_creation_is_atomic_replayable_private_and_usable_after_restart() {
    let (store, pool, first, second) = setup().await;
    let origin = equip(&store, &pool, first).await;
    let coords = empty(&store, first).await;
    let fleet = launch(&store, first, origin, coords, 2).await;
    store.set_test_time(fleet.due_at).await.unwrap();
    let (claim, facts, result) = due(&store, first.universe).await;
    assert_eq!(facts.state.players.len(), 1);
    assert_eq!(
        facts
            .state
            .world
            .as_ref()
            .unwrap()
            .planet_slots
            .iter()
            .find(|x| x.coordinates == coords)
            .unwrap()
            .occupant,
        None
    );
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM bodies WHERE owner=$1")
        .bind(first.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, 1);
    let restored: GameState =
        serde_json::from_value(serde_json::to_value(&facts.state).unwrap()).unwrap();
    assert_eq!(transition(&restored, &claim.input, &facts.rules), result);
    // A dead worker cannot commit after lease takeover; the same logical input
    // and random stream are replayed by its replacement.
    store.set_test_time(fleet.due_at + 16001).await.unwrap();
    let replacement = store
        .claim_scoped(first.universe, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(replacement.input, claim.input);
    assert!(matches!(
        store.commit_scoped(&claim, result.clone()).await.unwrap(),
        CommitOutcome::StaleClaim
    ));
    let claim = replacement;
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_writes','error',true)").execute(&pool).await.unwrap();
    assert!(matches!(
        store.commit_scoped(&claim, result.clone()).await,
        Err(StoreError::Unavailable)
    ));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM bodies WHERE owner=$1")
        .bind(first.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM colony_genesis WHERE universe=$1")
        .bind(first.universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store.commit_scoped(&claim, result.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    assert!(matches!(
        store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let reopened = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let (snap, _) = reopened.bound_world(first).await.unwrap().facts;
    assert_eq!(snap.state.bodies.len(), 2);
    assert_eq!(snap.state.epoch, first.epoch);
    let colony = snap.state.bodies.values().find(|b| b.id != origin).unwrap();
    assert_eq!(
        colony.checkpoint.amounts,
        Resources::from_values([1500 * SCALE, 500 * SCALE, 0])
    );
    assert_eq!(colony.checkpoint.at, fleet.due_at);
    assert!(colony.levels.values().all(|n| *n == 0));
    assert_eq!(
        snap.state.production_settings[&colony.id].settings,
        ProductionSettings::default()
    );
    validate_asset_lineage(&snap.state).unwrap();
    let game = GameService::new(reopened.clone());
    let principal = Principal {
        account: first.account,
        player: first.player,
        universe: first.universe,
    };
    let view = game
        .world_view(
            principal,
            QueryContext {
                binding: first,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let projected_colony = view
        .progression
        .bodies
        .iter()
        .find(|b| b.id == colony.id)
        .unwrap();
    let genesis = projected_colony.colony.as_ref().unwrap();
    assert_eq!(projected_colony.diameter_km, Some(genesis.diameter_km));
    assert_eq!(
        projected_colony.min_temperature,
        Some(genesis.min_temperature)
    );
    assert_eq!(
        projected_colony.max_temperature,
        Some(genesis.max_temperature)
    );
    assert_eq!(
        view.progression
            .bodies
            .iter()
            .map(|body| body.id)
            .collect::<Vec<_>>(),
        [origin, colony.id],
        "the homeworld remains the default after colonization and restart"
    );
    assert!(
        view.progression
            .capabilities
            .iter()
            .any(|c| c.capability == "Colonize" && c.enabled)
    );
    let (other, _) = reopened.bound_world(second).await.unwrap().facts;
    assert!(!other.state.bodies.contains_key(&colony.id));
    assert!(other.state.world.unwrap().records.colonies.is_empty());
    let reports: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM mission_reports WHERE universe=$1 AND kind='Colonized'",
    )
    .bind(first.universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(reports, 1);
    let returning = &snap.state.world.as_ref().unwrap().records.fleets[&fleet.id];
    assert_eq!(returning.ships[0].count, 1);
    assert_eq!(returning.cargo, Resources::default());
    reopened.set_test_time(returning.due_at).await.unwrap();
    let (ret, _, outcome) = due(&reopened, first.universe).await;
    reopened.commit_scoped(&ret, outcome).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count FROM inventories WHERE body=$1 AND item=$2")
        .bind(origin.0)
        .bind(sqlx::types::Json(ManufacturedItem::Ship(
            ShipType::ColonyShip,
        )))
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 2);
    reopened.audit_universe(first.universe).await.unwrap();
}

#[tokio::test]
async fn signup_waits_for_earlier_colony_claim_and_reselects_without_partial_membership() {
    let (store, pool, first, _) = setup().await;
    let origin = equip(&store, &pool, first).await;
    // Restrict all other admission positions using real committed bodies so the
    // deterministic allocator must initially select the fleet's empty target.
    let coords = empty(&store, first).await;
    for position in 4..=12 {
        if position == coords.position {
            continue;
        }
        sqlx::query("INSERT INTO bodies SELECT $2,universe,owner,kind,galaxy,system,$3,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies WHERE id=$1 ON CONFLICT DO NOTHING")
            .bind(origin.0).bind(Uuid::new_v4()).bind(position as i32).execute(&pool).await.unwrap();
    }
    // These occupancy-only fixture planets belong to an unrelated third player,
    // outside the mission participant closure, and need no private projection.
    let outsider: Uuid =
        sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 AND id<>$2 LIMIT 1")
            .bind(first.universe.0)
            .bind(first.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE bodies SET owner=$2 WHERE universe=$1 AND id<>$3 AND owner=$4")
        .bind(first.universe.0)
        .bind(outsider)
        .bind(origin.0)
        .bind(first.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let fleet = launch(&store, first, origin, coords, 1).await;
    store.set_test_time(fleet.due_at).await.unwrap();
    let (claim, _, result) = due(&store, first.universe).await;
    let writer = store.clone();
    let u = first.universe;
    let enrolling = tokio::spawn(async move {
        SessionService::new(writer)
            .signup(
                &format!("race{}", Uuid::new_v4().simple()),
                "password",
                SignupPolicy {
                    universe: u,
                    max_players: 9,
                },
                None,
            )
            .await
    });
    tokio::task::yield_now().await;
    assert!(matches!(
        store.commit_scoped(&claim, result).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let error = enrolling
        .await
        .unwrap()
        .err()
        .expect("full universe rejects enrollment");
    assert!(matches!(error, ServiceError::UniverseFull), "{error:?}");
    let members: i64 =
        sqlx::query_scalar("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(members, 2);
    let occupied: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM bodies WHERE universe=$1 AND galaxy=$2 AND system=$3 AND position=$4",
    )
    .bind(u.0)
    .bind(coords.galaxy as i32)
    .bind(coords.system as i32)
    .bind(coords.position as i32)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(occupied, 1);
}

#[tokio::test]
async fn concurrent_arrivals_serialize_both_coordinate_and_player_capacity() {
    for same_owner in [true, false] {
        let (store, pool, first, other) = setup().await;
        let origin = equip(&store, &pool, first).await;
        let (second, target_origin) = if same_owner {
            (first, origin)
        } else {
            (other, equip(&store, &pool, other).await)
        };
        let coordinates = empty(&store, first).await;
        let second_coordinates = if same_owner {
            let (snapshot, _) = store
                .bound_world_query(
                    first,
                    WorldQueryKind::Galaxy {
                        galaxy: 1,
                        system: 1,
                    },
                )
                .await
                .unwrap()
                .facts;
            snapshot
                .state
                .world
                .unwrap()
                .planet_slots
                .into_iter()
                .find(|slot| {
                    slot.coordinates != coordinates
                        && (4..=12).contains(&slot.coordinates.position)
                        && slot.occupant.is_none()
                })
                .unwrap()
                .coordinates
        } else {
            coordinates
        };
        let one = launch(&store, first, origin, coordinates, 1).await;
        let two = launch(&store, second, target_origin, second_coordinates, 1).await;
        assert_ne!(one.id, two.id);
        store
            .set_test_time(one.due_at.max(two.due_at))
            .await
            .unwrap();
        let (claim, _, result) = due(&store, first.universe).await;
        assert!(
            store
                .claim_scoped(first.universe, WorkerId(Uuid::new_v4()))
                .await
                .unwrap()
                .is_none(),
            "overlapping arrivals must not compute concurrently"
        );
        store.commit_scoped(&claim, result).await.unwrap();
        let (loser, facts, result) = due(&store, first.universe).await;
        let TransitionResult::Applied(change) = &result else {
            unreachable!()
        };
        assert!(change.bodies.is_empty());
        assert!(change.world.as_ref().unwrap().audits.is_empty());
        assert!(
            change
                .world
                .as_ref()
                .unwrap()
                .records
                .reports
                .values()
                .any(|r| r.kind == "ColonizationFailed")
        );
        assert!(
            facts.state.bodies.len() <= 2,
            "foreign occupant's economy is outside an arrival's owner scope"
        );
        store.commit_scoped(&loser, result).await.unwrap();
        let colonies: i64 =
            sqlx::query_scalar("SELECT count(*) FROM colony_genesis WHERE universe=$1")
                .bind(first.universe.0)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(colonies, 1);
        store.audit_universe(first.universe).await.unwrap();
    }
}

#[tokio::test]
async fn activated_legacy_world_audits_colonies_and_admits_without_reusing_their_slots() {
    use orbit_storage_postgres::MvpAccount;
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("legacy-colony-{i}-{}", Uuid::new_v4().simple()),
        password: "test-password-long".into(),
    });
    store
        .bootstrap_mvp_raids(universe, 1000, &accounts, &[8; 32])
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let binding = GameService::new(store.clone())
        .current_binding(auth.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let service = RulesService::new(store.clone());
    let mut doc = service.export(universe).await.unwrap();
    doc.artifact =
        serde_json::from_slice(include_bytes!("../../../rules/mvp-v1-slice-6.json")).unwrap();
    service.apply(&doc).await.unwrap();
    store.prepare_scoped_runtime(universe, 100).await.unwrap();
    store.activate_scoped_runtime(universe).await.unwrap();
    let pool = PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let origin = equip(&store, &pool, binding).await;
    let coordinates = empty(&store, binding).await;
    let fleet = launch(&store, binding, origin, coordinates, 1).await;
    store.set_test_time(fleet.due_at).await.unwrap();
    let (claim, _, outcome) = due(&store, universe).await;
    store.commit_scoped(&claim, outcome).await.unwrap();
    store.audit_universe(universe).await.unwrap();
    let newcomer = enroll(&store, universe).await;
    let (snapshot, _) = store.bound_world(newcomer).await.unwrap().facts;
    assert_ne!(
        snapshot.state.bodies.values().next().unwrap().coordinates,
        coordinates
    );
    store.audit_universe(universe).await.unwrap();
}

async fn submit_local(
    store: &PgStore,
    b: Binding,
    body: BodyId,
    command: Command,
) -> ForegroundAction {
    let id = CommandId(Uuid::new_v4());
    let pair = ForegroundAction {
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(body),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(id),
                },
            }),
        },
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: b,
            command_id: id,
            command: CommandDto3::Progression(command),
        },
    };
    store.bound_admit4(pair.clone()).await.unwrap();
    let game = GameService::new(store.clone());
    for _ in 0..2 {
        game.step_scoped(b.universe, WorkerId(Uuid::new_v4()), &InlineEngine)
            .await
            .unwrap();
    }
    let receipt = store.bound_receipt(b, id).await.unwrap();
    assert!(
        matches!(receipt.status, ReceiptStatus::Committed { .. }),
        "{receipt:?}"
    );
    pair
}
#[tokio::test]
async fn colony_abandonment_persists_losses_cancels_work_and_releases_slot_after_restart() {
    let (store, pool, b, other) = setup().await;
    let home = equip(&store, &pool, b).await;
    let coords = empty(&store, b).await;
    let fleet = launch(&store, b, home, coords, 1).await;
    store.set_test_time(fleet.due_at).await.unwrap();
    let (claim, _, result) = due(&store, b.universe).await;
    let id = if let TransitionResult::Applied(c) = &result {
        c.bodies[0].id
    } else {
        panic!()
    };
    store.commit_scoped(&claim, result).await.unwrap();
    let (facts, _) = store.bound_world(b).await.unwrap().facts;
    let q = quote(
        &facts.state,
        Actor::Player(b.player),
        &QuoteRequest::Upgrade {
            body: id,
            building: Building::MetalMine,
        },
        facts.at,
        &facts.rules,
    )
    .unwrap();
    submit_local(
        &store,
        b,
        id,
        Command::StartUpgrade {
            body: id,
            building: Building::MetalMine,
            expected_terms_hash: q.terms_hash,
        },
    )
    .await;
    let (facts, _) = store.bound_world(b).await.unwrap().facts;
    let before_home = facts.state.bodies[&home].checkpoint.clone();
    let research = facts.state.research[&b.player].clone();
    let q = quote_abandonment(&facts.state, b.player, id, facts.at, &facts.rules).unwrap();
    assert!(q.blockers.is_empty());
    assert_eq!(q.losses[0].construction.len(), 1);
    let pair = submit_local(
        &store,
        b,
        id,
        Command::World {
            action: WorldAction::AbandonPlanet {
                body: id,
                expected_terms_hash: q.terms_hash,
            },
        },
    )
    .await;
    assert!(matches!(
        store.bound_admit4(pair).await.unwrap().status,
        ReceiptStatus::Committed { .. }
    ));
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let reopened = PgStore::connect(&url).await.unwrap();
    let (after, _) = reopened.bound_world(b).await.unwrap().facts;
    assert!(!after.state.bodies.contains_key(&id));
    assert_eq!(after.state.bodies[&home].checkpoint, before_home);
    assert_eq!(after.state.research[&b.player], research);
    let t = &after.state.world.as_ref().unwrap().records.abandonments[&id];
    assert!(!t.released);
    assert_eq!(t.release_at, q.release_at);
    let statuses: Vec<String> =
        sqlx::query_scalar("SELECT status FROM constructions WHERE body=$1")
            .bind(id.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(statuses, vec!["BodyAbandoned"]);
    let report: serde_json::Value = sqlx::query_scalar(
        "SELECT data FROM mission_reports WHERE universe=$1 AND kind='PlanetAbandoned'",
    )
    .bind(b.universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        report["payloads"][b.player.to_string()]["abandonment"]["body"],
        id.to_string()
    );
    let (galaxy, _) = reopened
        .bound_world_query(
            other,
            WorldQueryKind::Galaxy {
                galaxy: coords.galaxy,
                system: coords.system,
            },
        )
        .await
        .unwrap()
        .facts;
    let system = galaxy_system(
        &galaxy.state,
        other.player,
        coords.galaxy,
        coords.system,
        galaxy.at,
        &galaxy.rules,
    )
    .unwrap();
    let position = system
        .positions
        .iter()
        .find(|x| x.coordinates == coords)
        .unwrap();
    assert!(position.body.is_none());
    assert_eq!(position.abandoned_until, Some(q.release_at));
    assert_eq!(
        resolve_destination(
            &galaxy.state,
            DestinationSelection::EmptyPositionAt {
                coordinates: coords
            },
            &galaxy.rules
        ),
        Err(GameError::PositionOccupied)
    );
    // Operator-created players must also respect the temporary occupied slot.
    let patch: WorldScenario = serde_json::from_value(serde_json::json!({"version":1,"edits":[{"op":"add-bot","user":"abandoned-slot-probe","planet":format!("{}:{}:{}",coords.galaxy,coords.system,coords.position)}]})).unwrap();
    let error = reopened
        .apply_world_scenario(b.universe, &patch, ScenarioMode::Patch, Uuid::new_v4())
        .await
        .unwrap_err();
    assert!(error.to_string().contains("occupied"), "{error}");
    reopened.set_test_time(q.release_at).await.unwrap();
    let (claim, _, result) = due(&reopened, b.universe).await;
    assert!(
        matches!(claim.input.payload,Input::Event(ScheduledEvent::AbandonedSlotDue{body,..}) if body==id)
    );
    reopened.commit_scoped(&claim, result).await.unwrap();
    let (released, _) = reopened
        .bound_world_query(
            b,
            WorldQueryKind::ResolveDestination {
                selection: DestinationSelection::EmptyPositionAt {
                    coordinates: coords,
                },
            },
        )
        .await
        .unwrap()
        .facts;
    assert!(
        resolve_destination(
            &released.state,
            DestinationSelection::EmptyPositionAt {
                coordinates: coords
            },
            &released.rules
        )
        .is_ok()
    );
    // A fresh colony at the released coordinates gets a new identity.
    let replacement = launch(&reopened, b, home, coords, 1).await;
    reopened.set_test_time(replacement.due_at).await.unwrap();
    let (claim, _, result) = due(&reopened, b.universe).await;
    if let TransitionResult::Applied(c) = &result {
        assert_ne!(c.bodies[0].id, id);
    }
    reopened.commit_scoped(&claim, result).await.unwrap();
}
