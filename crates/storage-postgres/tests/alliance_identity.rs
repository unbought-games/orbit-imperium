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
async fn social(
    game: &GameService<PgStore>,
    b: Binding,
    action: AllianceAction,
    revision: Option<u64>,
) -> AllianceCommandResult {
    game.alliance_command(
        principal(b),
        AllianceCommandRequest {
            context: context(b),
            command_id: Uuid::new_v4(),
            expected_revision: revision,
            action,
        },
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn delayed_espionage_preserves_event_affiliation_through_rename_disband_and_sharing() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-alliance_identity");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("alliance-identity-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_raids(u, 1000, &accounts, &[28; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let game = GameService::new(store.clone());
    let mut players = Vec::new();
    for account in &accounts[..2] {
        let session = SessionService::new(store.clone())
            .login(&account.name, &account.password, None)
            .await
            .unwrap();
        players.push(
            game.current_binding(session.session.account, u, Uuid::new_v4())
                .await
                .unwrap()
                .binding,
        );
    }
    let (sender, target) = (players[0], players[1]);
    let created = social(
        &game,
        target,
        AllianceAction::Create {
            name: "Original alliance".into(),
            tag: "OLD".into(),
        },
        None,
    )
    .await;
    let alliance = created.alliance.unwrap();
    let current = game
        .player_alliances(principal(sender), sender, vec![target.player])
        .await
        .unwrap();
    assert_eq!(current[&target.player].tag, "OLD");
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let (snapshot, _) = store.bound_world(sender).await.unwrap().facts;
    let origin = *snapshot.state.bodies.keys().next().unwrap();
    let (snapshot, _) = store.bound_world(target).await.unwrap().facts;
    let destination = snapshot.state.bodies.values().next().unwrap().clone();
    // Deterministic fleet fixture, with the exact matching asset value.
    let rules = store.load_rules(u).await.unwrap();
    sqlx::query("UPDATE bodies SET amounts=jsonb_set(amounts,'{deuterium}',to_jsonb(1000000000::bigint)) WHERE id=$1").bind(origin.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,1,0) ON CONFLICT(body,owner,item) DO UPDATE SET count=1")
        .bind(origin.0).bind(sender.player.0).bind(sqlx::types::Json(ManufacturedItem::Ship(ShipType::EspionageProbe))).execute(&pool).await.unwrap();
    let lot = AssetLot {
        id: OperationId(Uuid::new_v4()),
        owner: sender.player,
        item: CatalogKey::Ship(ShipType::EspionageProbe),
        level: None,
        location: AssetLocation::Body(origin),
        quantity: 1,
        unit_value_micro: 1000 * SCALE,
        rules_hash: rules.hash.clone(),
        source_operation: OperationId(Uuid::new_v4()),
        acquired_at: 1000,
        acquired_sequence: 1,
    };
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,'alliance-spy',$2)")
        .bind(u.0)
        .bind(sqlx::types::Json(lot))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO inventories(body,owner,item,count,revision) VALUES($1,$2,$3,1,0) ON CONFLICT(body,owner,item) DO UPDATE SET count=1")
        .bind(destination.id.0).bind(target.player.0).bind(sqlx::types::Json(ManufacturedItem::Ship(ShipType::EspionageProbe))).execute(&pool).await.unwrap();
    let defender_lot = AssetLot {
        id: OperationId(Uuid::new_v4()),
        owner: target.player,
        item: CatalogKey::Ship(ShipType::EspionageProbe),
        level: None,
        location: AssetLocation::Body(destination.id),
        quantity: 1,
        unit_value_micro: 1000 * SCALE,
        rules_hash: rules.hash.clone(),
        source_operation: OperationId(Uuid::new_v4()),
        acquired_at: 1000,
        acquired_sequence: 1,
    };
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,'alliance-defender-spy',$2)")
        .bind(u.0)
        .bind(sqlx::types::Json(defender_lot))
        .execute(&pool)
        .await
        .unwrap();
    store.prepare_scoped_runtime(u, 100).await.unwrap();
    store.activate_scoped_runtime(u).await.unwrap();
    let intent = FleetIntent {
        origin,
        destination: MissionDestination::Body {
            id: destination.id,
            expected_kind: destination.kind,
            expected_owner: target.player,
        },
        mission: Mission::Espionage,
        ships: vec![ManifestStack {
            owner: sender.player,
            ship_type: ShipType::EspionageProbe,
            count: 1,
        }],
        cargo: Resources::default(),
        speed_percent: 100,
    };
    let quote = store
        .bound_quote(
            sender,
            &QuoteRequest::Fleet {
                intent: intent.clone(),
            },
        )
        .await
        .unwrap()
        .facts
        .0;
    let terms = quote_fleet(&quote.state, sender.player, &intent, quote.at, &quote.rules).unwrap();
    let command_id = CommandId(Uuid::new_v4());
    let pair = ForegroundAction {
        gameplay: CommandEnvelopeV4 {
            protocol: 4,
            binding: sender,
            command_id,
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::LaunchFleet {
                    intent,
                    expected_terms_hash: terms.terms_hash.clone(),
                },
            }),
        },
        presence: CommandEnvelopeV4 {
            protocol: 4,
            binding: sender,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(origin),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            }),
        },
    };
    let accepted = store.admit_scoped(pair).await.unwrap();
    let arrival = accepted.admitted_at + terms.duration_ms;
    // Change membership labels AFTER the arrival but BEFORE resolving its report.
    store.set_test_time(arrival + 1).await.unwrap();
    let renamed = social(
        &game,
        target,
        AllianceAction::Update {
            alliance,
            name: "Renamed alliance".into(),
            tag: "NEW".into(),
            public_text: String::new(),
            recruitment: AllianceRecruitment::Open,
        },
        created.revision,
    )
    .await;
    assert_eq!(
        game.player_alliances(principal(sender), sender, vec![target.player])
            .await
            .unwrap()[&target.player]
            .tag,
        "NEW"
    );
    for _ in 0..12 {
        if matches!(
            game.step_scoped(u, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap(),
            StepOutcome::Idle
        ) {
            break;
        }
    }
    let report: Uuid =
        sqlx::query_scalar("SELECT id FROM mission_reports WHERE universe=$1 AND kind='Espionage'")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    let detail = game
        .report4(principal(sender), context(sender), ReportId(report))
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(detail.player_alliances[&target.player].tag, "OLD");
    assert_eq!(detail.header.player_alliances[&target.player].tag, "OLD");
    social(
        &game,
        target,
        AllianceAction::Disband { alliance },
        renamed.revision,
    )
    .await;
    assert!(
        game.player_alliances(principal(sender), sender, vec![target.player])
            .await
            .unwrap()
            .is_empty()
    );
    let detail = game
        .report4(principal(sender), context(sender), ReportId(report))
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(detail.player_alliances[&target.player].tag, "OLD");
    for include_identity in [false, true] {
        let status = game
            .report_share(
                principal(sender),
                ReportId(report),
                ReportShareRequest {
                    context: context(sender),
                    action: ReportShareAction::Create {
                        options: ReportShareOptions {
                            include_identity,
                            include_coordinates: false,
                        },
                    },
                },
            )
            .await
            .unwrap();
        let shared = game.shared_report(status.token.unwrap()).await.unwrap();
        if include_identity {
            assert_eq!(shared.player_alliances.values().next().unwrap().tag, "OLD");
        } else {
            assert!(shared.player_alliances.is_empty());
        }
        game.report_share(
            principal(sender),
            ReportId(report),
            ReportShareRequest {
                context: context(sender),
                action: ReportShareAction::Revoke,
            },
        )
        .await
        .unwrap();
    }
    // Legacy report without captured affiliation stays unknown despite later membership.
    sqlx::query("DELETE FROM mission_report_alliances WHERE report=$1")
        .bind(report)
        .execute(&pool)
        .await
        .unwrap();
    social(
        &game,
        target,
        AllianceAction::Create {
            name: "Later alliance".into(),
            tag: "LATE".into(),
        },
        None,
    )
    .await;
    assert!(
        game.report4(principal(sender), context(sender), ReportId(report))
            .await
            .unwrap()
            .facts
            .data
            .player_alliances
            .is_empty()
    );
    pool.close().await;
}
