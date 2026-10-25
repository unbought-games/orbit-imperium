use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::json;
use uuid::Uuid;
fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn request(b: Binding, action: ReportShareAction) -> ReportShareRequest {
    ReportShareRequest {
        context: QueryContext {
            binding: b,
            request_id: Uuid::new_v4(),
        },
        action,
    }
}
#[tokio::test]
async fn shares_are_explicit_recipient_scoped_revocable_historical_and_deleted_with_reports() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("report-share-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, 1000, &accounts, &[23; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let game = GameService::new(store.clone());
    let mut bindings = Vec::new();
    for a in &accounts[..3] {
        let auth = SessionService::new(store.clone())
            .login(&a.name, &a.password, None)
            .await
            .unwrap();
        bindings.push(
            game.current_binding(auth.session.account, u, Uuid::new_v4())
                .await
                .unwrap()
                .binding,
        );
    }
    let (a, b, outsider) = (bindings[0], bindings[1], bindings[2]);
    let id = ReportId(Uuid::new_v4());
    let event = InputId(Uuid::new_v4());
    let limited = json!({"kind":"ContactLost","at":1000,"target":{"galaxy":1,"system":1,"position":2},"own_lost_ships":[{"ship_type":"SmallCargo","count":"2"}],"own_cargo_loss":{"metal":"100","crystal":"0","deuterium":"0"}});
    let full = json!({"kind":"Combat","at":1000,"target":{"galaxy":1,"system":1,"position":2},"participants":[{"owner":a.player,"origin":{"Fleet":Uuid::new_v4()},"side":"Attacker","units":[],"technology":[0,0,0]}],"outcome":"DefenderVictory","private":"SECRET"});
    let report = MissionReport {
        id,
        event,
        kind: "Combat".into(),
        at: 1000,
        fleet: None,
        rules_hash: Ruleset::mvp_fleets().unwrap().hash,
        payloads: std::collections::BTreeMap::from([(a.player, limited), (b.player, full)]),
    };
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Combat',1000,$4)").bind(u.0).bind(id.0).bind(event.0).bind(sqlx::types::Json(report)).execute(&pool).await.unwrap();
    for binding in [a, b] {
        sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,1)").bind(id.0).bind(binding.player.0).execute(&pool).await.unwrap();
        sqlx::query("UPDATE mission_report_heads SET revision=1 WHERE recipient=$1")
            .bind(binding.player.0)
            .execute(&pool)
            .await
            .unwrap();
    }
    let create = ReportShareAction::Create {
        options: ReportShareOptions {
            include_identity: true,
            include_coordinates: true,
        },
    };
    assert!(
        game.report_share(principal(a), id, request(a, ReportShareAction::Status))
            .await
            .unwrap()
            .token
            .is_none()
    );
    assert!(matches!(
        game.shared_report(id.0).await,
        Err(ServiceError::NotFound)
    ));
    for action in [
        create.clone(),
        ReportShareAction::Status,
        ReportShareAction::Revoke,
    ] {
        assert!(matches!(
            game.report_share(principal(outsider), id, request(outsider, action.clone()))
                .await,
            Err(ServiceError::NotFound)
        ));
        assert!(matches!(
            game.report_share(principal(b), id, request(a, action))
                .await,
            Err(ServiceError::NotFound)
        ));
    }
    let token = game
        .report_share(principal(a), id, request(a, create.clone()))
        .await
        .unwrap()
        .token
        .unwrap();
    let again = game
        .report_share(
            principal(a),
            id,
            request(
                a,
                ReportShareAction::Create {
                    options: Default::default(),
                },
            ),
        )
        .await
        .unwrap();
    assert_eq!(again.token, Some(token));
    assert!(again.options.unwrap().include_identity);
    let public = game.shared_report(token).await.unwrap();
    assert_eq!(public.report, id);
    assert_eq!(public.payload["kind"], "ContactLost");
    assert!(public.payload.get("participants").is_none());
    let other_token = game
        .report_share(principal(b), id, request(b, create.clone()))
        .await
        .unwrap()
        .token
        .unwrap();
    assert_ne!(other_token, token);
    sqlx::query("UPDATE accounts SET name='renamed-after-publication' WHERE id=$1")
        .bind(a.account.0)
        .execute(&pool)
        .await
        .unwrap();
    let public = game.shared_report(other_token).await.unwrap();
    assert!(public.player_names.values().any(|n| n == &accounts[0].name));
    assert!(!serde_json::to_string(&public).unwrap().contains("SECRET"));
    game.report_share(principal(a), id, request(a, ReportShareAction::Revoke))
        .await
        .unwrap();
    assert!(matches!(
        game.shared_report(token).await,
        Err(ServiceError::NotFound)
    ));
    assert!(game.shared_report(other_token).await.is_ok());
    let new_token = game
        .report_share(principal(a), id, request(a, create.clone()))
        .await
        .unwrap()
        .token
        .unwrap();
    assert_ne!(new_token, token);
    // Stars protect the report and its shared link. Once unstarred, deletion
    // revokes the link; restoring the report must not revive it.
    for (action, rejected, link_present) in [
        (
            WorldAction::SetReportStarred {
                report: id,
                starred: true,
            },
            false,
            true,
        ),
        (
            WorldAction::SetReportHidden {
                report: id,
                hidden: true,
            },
            true,
            true,
        ),
        (
            WorldAction::SetReportStarred {
                report: id,
                starred: false,
            },
            false,
            true,
        ),
        (
            WorldAction::SetReportHidden {
                report: id,
                hidden: true,
            },
            false,
            false,
        ),
        (
            WorldAction::SetReportHidden {
                report: id,
                hidden: false,
            },
            false,
            false,
        ),
    ] {
        let command_id = CommandId(Uuid::new_v4());
        let envelope = |id, action| CommandEnvelopeV4 {
            protocol: 4,
            binding: a,
            command_id: id,
            command: CommandDto3::Progression(Command::World { action }),
        };
        let pair = ForegroundAction {
            gameplay: envelope(command_id, action),
            presence: envelope(
                CommandId(Uuid::new_v4()),
                WorldAction::RecordForegroundPresence {
                    body: None,
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            ),
        };
        game.world_submit(principal(a), pair).await.unwrap();
        for _ in 0..8 {
            game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
        }
        let receipt = game
            .bound_receipt(principal(a), a, command_id)
            .await
            .unwrap();
        if rejected {
            assert_eq!(
                receipt.status,
                ReceiptStatus::Rejected {
                    code: GameError::InvalidInput
                }
            );
        } else {
            assert!(matches!(receipt.status, ReceiptStatus::Committed { .. }));
        }
        if link_present {
            assert!(game.shared_report(new_token).await.is_ok());
        } else {
            assert!(matches!(
                game.shared_report(new_token).await,
                Err(ServiceError::NotFound)
            ));
        }
        assert!(game.shared_report(other_token).await.is_ok());
    }
    sqlx::query("DELETE FROM mission_report_recipients WHERE report=$1 AND recipient=$2")
        .bind(id.0)
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        game.shared_report(other_token).await,
        Err(ServiceError::NotFound)
    ));
    assert!(
        game.report_share(principal(b), id, request(b, create))
            .await
            .is_err()
    );
    pool.close().await;
}
