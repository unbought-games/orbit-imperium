use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use uuid::Uuid;

fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn context(b: Binding) -> QueryContext {
    QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    }
}
fn pair(b: Binding, body: BodyId, name: &str) -> ForegroundAction {
    let gameplay = CommandEnvelopeV4 {
        protocol: 4,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto3::Progression(Command::World {
            action: WorldAction::RenamePlanet {
                body,
                name: name.into(),
            },
        }),
    };
    ForegroundAction {
        presence: CommandEnvelopeV4 {
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
        },
        gameplay,
    }
}
async fn settle(game: &GameService<PgStore>, b: Binding, pair: &ForegroundAction) -> BoundReceipt {
    for _ in 0..8 {
        game.step(b.universe, WorkerId(Uuid::new_v4()))
            .await
            .unwrap();
        let receipt = game
            .bound_receipt(principal(b), b, pair.gameplay.command_id)
            .await
            .unwrap();
        if !matches!(receipt.status, ReceiptStatus::Pending) {
            return receipt;
        }
    }
    panic!("rename did not reach a terminal receipt")
}

#[tokio::test]
async fn planet_names_survive_restart_publish_to_other_players_and_retry_once() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-planet_names");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("planet-names-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[23; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let game = GameService::new(store.clone());
    let mut bindings = vec![];
    for account in &accounts[..2] {
        let auth = SessionService::new(store.clone())
            .login(&account.name, &account.password, None)
            .await
            .unwrap();
        bindings.push(
            game.current_binding(auth.session.account, universe, Uuid::new_v4())
                .await
                .unwrap()
                .binding,
        );
    }
    let b = bindings[0];
    let other = bindings[1];
    let initial = game.world_view(principal(b), context(b)).await.unwrap();
    let body = &initial.progression.bodies[0];
    assert!(body.name.is_none());
    let before = store.bound_world(b).await.unwrap().facts.0.state.bodies[&body.id].clone();
    let updates = store.read_updates(b, None, 128).await.unwrap();
    let cursor = updates.items[0].cursor.as_deref();
    let command = pair(b, body.id, "  世界 🪐  ");
    let (first, retry) = tokio::join!(
        game.world_submit(principal(b), command.clone()),
        game.world_submit(principal(b), command.clone())
    );
    assert_eq!(first.unwrap().admitted_at, retry.unwrap().admitted_at);
    assert!(matches!(
        settle(&game, b, &command).await.status,
        ReceiptStatus::Committed { .. }
    ));
    assert!(matches!(
        game.world_submit(principal(b), command.clone())
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    let reopened = PgStore::connect(&url).await.unwrap();
    let restored = GameService::new(reopened.clone());
    let view = restored.world_view(principal(b), context(b)).await.unwrap();
    assert_eq!(view.progression.bodies[0].name.as_deref(), Some("世界 🪐"));
    let after = reopened.bound_world(b).await.unwrap().facts.0.state.bodies[&body.id].clone();
    assert_eq!(after.revision, before.revision + 1);
    assert_eq!(after.checkpoint, before.checkpoint);
    assert_eq!(after.levels, before.levels);
    let delivery = reopened.read_updates(b, cursor, 128).await.unwrap();
    assert!(
        delivery
            .items
            .iter()
            .any(|update| matches!(update.event, StreamEvent::Invalidate { .. }))
    );
    let galaxy = restored
        .world_query(
            principal(other),
            WorldQuery {
                context: context(other),
                query: WorldQueryKind::Galaxy {
                    galaxy: body.coordinates.galaxy,
                    system: body.coordinates.system,
                },
            },
        )
        .await
        .unwrap();
    let public = galaxy.data["positions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["body"]["id"] == body.id.to_string())
        .unwrap();
    assert_eq!(public["body"]["name"], "世界 🪐");
    let other_view = restored
        .world_view(principal(other), context(other))
        .await
        .unwrap();
    let origin = other_view.progression.bodies[0].id;
    // A single controlled transport fixture exercises public labels on an active route.
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("UPDATE bodies SET amounts=jsonb_set(amounts,'{deuterium}',to_jsonb(1000000000::bigint)) WHERE id=$1")
        .bind(origin.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,1,0)")
        .bind(origin.0)
        .bind(other.player.0)
        .bind(sqlx::types::Json(ManufacturedItem::Ship(
            ShipType::SmallCargo,
        )))
        .execute(&pool)
        .await
        .unwrap();
    let lot_id = OperationId(Uuid::new_v4());
    let lot = AssetLot {
        id: lot_id,
        owner: other.player,
        item: CatalogKey::Ship(ShipType::SmallCargo),
        level: None,
        location: AssetLocation::Body(origin),
        quantity: 1,
        unit_value_micro: 4000 * SCALE,
        rules_hash: Ruleset::mvp_fleets().unwrap().hash,
        source_operation: lot_id,
        acquired_at: 1000,
        acquired_sequence: 1,
    };
    sqlx::query(
        "INSERT INTO asset_lots(universe,key,data) VALUES($1,'rename-transport-fixture',$2)",
    )
    .bind(universe.0)
    .bind(sqlx::types::Json(lot))
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;
    let intent = FleetIntent {
        origin,
        destination: MissionDestination::Body {
            id: body.id,
            expected_kind: BodyKind::Planet,
            expected_owner: b.player,
        },
        mission: Mission::Transport,
        ships: vec![ManifestStack {
            owner: other.player,
            ship_type: ShipType::SmallCargo,
            count: 1,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let quote = restored
        .world_query(
            principal(other),
            WorldQuery {
                context: context(other),
                query: WorldQueryKind::FleetQuote {
                    intent: intent.clone(),
                },
            },
        )
        .await
        .unwrap();
    let terms: FleetTerms = serde_json::from_value(quote.data.clone()).unwrap();
    let mut launch = pair(other, origin, "unused");
    launch.gameplay.command = CommandDto3::Progression(Command::World {
        action: WorldAction::LaunchFleet {
            intent: intent.clone(),
            expected_terms_hash: terms.terms_hash,
        },
    });
    restored
        .world_submit(principal(other), launch.clone())
        .await
        .unwrap();
    assert!(matches!(
        settle(&restored, other, &launch).await.status,
        ReceiptStatus::Committed { .. }
    ));
    let fleet_view = restored
        .world_view(principal(other), context(other))
        .await
        .unwrap();
    assert_eq!(
        fleet_view
            .progression
            .destinations
            .iter()
            .find(|d| d.id == body.id)
            .unwrap()
            .name
            .as_deref(),
        Some("世界 🪐")
    );
    // No cooldown: another command at the same controlled time succeeds.
    let again = pair(b, body.id, &"🪐".repeat(40));
    restored
        .world_submit(principal(b), again.clone())
        .await
        .unwrap();
    assert!(matches!(
        settle(&restored, b, &again).await.status,
        ReceiptStatus::Committed { .. }
    ));
    let foreign = pair(other, body.id, "Stolen");
    restored
        .world_submit(principal(other), foreign.clone())
        .await
        .unwrap();
    assert!(matches!(
        settle(&restored, other, &foreign).await.status,
        ReceiptStatus::Rejected { .. }
    ));
    let invalid = pair(b, body.id, "\nInvalid");
    restored
        .world_submit(principal(b), invalid.clone())
        .await
        .unwrap();
    assert!(matches!(
        settle(&restored, b, &invalid).await.status,
        ReceiptStatus::Rejected {
            code: GameError::InvalidInput
        }
    ));
    let final_view = restored.world_view(principal(b), context(b)).await.unwrap();
    assert_eq!(final_view.progression.bodies[0].name, Some("🪐".repeat(40)));
    let fleet_view = restored
        .world_view(principal(other), context(other))
        .await
        .unwrap();
    assert_eq!(
        fleet_view
            .progression
            .destinations
            .iter()
            .find(|d| d.id == body.id)
            .unwrap()
            .name,
        Some("🪐".repeat(40))
    );
    assert_eq!(
        fleet_view.missions.fleets[0].intent, intent,
        "renaming never changes accepted mission terms"
    );
    let wrong_principal = principal(other);
    assert!(
        restored
            .world_submit(wrong_principal, pair(b, body.id, "Forged"))
            .await
            .is_err()
    );
    let stale = Binding {
        epoch: Epoch(Uuid::new_v4()),
        ..b
    };
    assert!(
        restored
            .world_submit(principal(b), pair(stale, body.id, "Stale"))
            .await
            .is_err()
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    for invalid in ["", " ", "bad\nname", &"a".repeat(41)] {
        assert!(
            sqlx::query("UPDATE bodies SET name=$2 WHERE id=$1")
                .bind(body.id.0)
                .bind(invalid)
                .execute(&pool)
                .await
                .is_err()
        );
    }
    pool.close().await;
    store.audit_universe(universe).await.unwrap();
}
