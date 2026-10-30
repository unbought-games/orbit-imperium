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
// Wait for an actual database lock boundary, not an arbitrary sleep. The
// disposable database runs this binary serially, so no unrelated query matches.
async fn wait_for_lock(pool: &sqlx::PgPool, query: &str) {
    tokio::time::timeout(std::time::Duration::from_secs(30), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1)")
                .bind(query).fetch_one(pool).await.unwrap();
            if waiting { break; }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }).await.expect("operation should reach the held database lock");
}
#[tokio::test]
async fn shares_are_explicit_recipient_scoped_revocable_historical_and_preserved_when_archived() {
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
        rules_hash: Ruleset::mvp_fleets().unwrap().hash.clone(),
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
    let before = store.world_report(a, id).await.unwrap();
    assert!(!before.facts.0.header.starred);
    assert!(!before.facts.0.header.shared);
    // Compute a report mutation before publication, then try to commit it
    // afterwards. It must be recomputed instead of overwriting the new star.
    let command_id = CommandId(Uuid::new_v4());
    let envelope = |id, action| CommandEnvelopeV4 {
        protocol: 4,
        binding: a,
        command_id: id,
        command: CommandDto3::Progression(Command::World { action }),
    };
    game.world_submit(
        principal(a),
        ForegroundAction {
            gameplay: envelope(command_id, WorldAction::MarkReportRead { report: id }),
            presence: envelope(
                CommandId(Uuid::new_v4()),
                WorldAction::RecordForegroundPresence {
                    body: None,
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(command_id),
                },
            ),
        },
    )
    .await
    .unwrap();
    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        claim.input.payload,
        Input::Command(Command::World {
            action: WorldAction::MarkReportRead { .. }
        })
    ));
    let snapshot = store.load_claim(&claim).await.unwrap();
    let computed = transition(&snapshot.state, &claim.input, &snapshot.rules);
    assert!(matches!(computed, TransitionResult::Applied(_)));
    // Pause publication after it has starred the recipient but before commit.
    // A command committing concurrently must lock before reading its facts;
    // otherwise it can read the old star then overwrite the new one later.
    let cursor = store.read_updates(a, None, 128).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    let other_cursor = store.read_updates(b, None, 128).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    let mut hold = pool.begin().await.unwrap();
    sqlx::query("SELECT revision FROM viewer_heads WHERE universe=$1 AND player=$2 FOR UPDATE")
        .bind(u.0)
        .bind(a.player.0)
        .fetch_one(&mut *hold)
        .await
        .unwrap();
    let publish_game = GameService::new(store.clone());
    let publish_action = create.clone();
    let publish = tokio::spawn(async move {
        publish_game
            .report_share(principal(a), id, request(a, publish_action))
            .await
            .unwrap()
    });
    wait_for_lock(
        &pool,
        "UPDATE viewer_heads SET revision=revision+1 WHERE universe=%",
    )
    .await;
    let commit_store = store.clone();
    let commit_claim = claim.clone();
    let commit = tokio::spawn(async move {
        commit_store
            .commit_claim(&commit_claim, computed)
            .await
            .unwrap()
    });
    wait_for_lock(&pool, "%mission_report_recipients%WHERE report=%").await;
    hold.rollback().await.unwrap();
    let published_status = publish.await.unwrap();
    let token = published_status.token.unwrap();
    assert!(published_status.header.starred && published_status.header.shared);
    assert_eq!(commit.await.unwrap(), CommitOutcome::Conflict);
    let updates = store.read_updates(a, Some(&cursor), 128).await.unwrap();
    assert_eq!(updates.items.len(), 1);
    assert!(
        matches!(&updates.items[0].event, StreamEvent::Invalidate { minimum_viewer_revision } if minimum_viewer_revision == &published_status.viewer_revision)
    );
    assert!(
        store
            .read_updates(b, Some(&other_cursor), 128)
            .await
            .unwrap()
            .items
            .is_empty()
    );
    game.resolve_claim(claim).await.unwrap();
    let published = store.world_report(a, id).await.unwrap();
    assert!(published.facts.0.header.starred);
    assert!(published.facts.0.header.shared);
    assert!(published.facts.0.header.read);
    assert!(published.facts.2 > before.facts.2);
    let other = store.world_report(b, id).await.unwrap();
    assert!(!other.facts.0.header.starred);
    assert!(!other.facts.0.header.shared);
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
    let revoke_cursor = store.read_updates(a, None, 128).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    game.report_share(principal(a), id, request(a, ReportShareAction::Revoke))
        .await
        .unwrap();
    assert!(matches!(
        game.shared_report(token).await,
        Err(ServiceError::NotFound)
    ));
    assert!(game.shared_report(other_token).await.is_ok());
    let revoked = store.world_report(a, id).await.unwrap();
    assert!(revoked.facts.0.header.starred);
    assert!(!revoked.facts.0.header.shared);
    assert!(revoked.facts.2 > published.facts.2);
    let updates = store
        .read_updates(a, Some(&revoke_cursor), 128)
        .await
        .unwrap();
    assert_eq!(updates.items.len(), 1);
    assert!(
        matches!(&updates.items[0].event, StreamEvent::Invalidate { minimum_viewer_revision } if minimum_viewer_revision == &revoked.facts.2.to_string())
    );
    let new_token = game
        .report_share(principal(a), id, request(a, create.clone()))
        .await
        .unwrap()
        .token
        .unwrap();
    assert_ne!(new_token, token);
    // A second recipient-owned report lets bulk commands exercise fact loading,
    // atomic protection and persistence for more than one report in one receipt.
    let second = ReportId(Uuid::new_v4());
    let second_event = InputId(Uuid::new_v4());
    let second_report = MissionReport {
        id: second,
        event: second_event,
        kind: "Combat".into(),
        at: 1000,
        fleet: None,
        rules_hash: Ruleset::mvp_fleets().unwrap().hash.clone(),
        payloads: std::collections::BTreeMap::from([(
            a.player,
            json!({"kind":"ContactLost","at":1000,"target":{"galaxy":1,"system":1,"position":2},"own_lost_ships":[],"own_cargo_loss":{"metal":"0","crystal":"0","deuterium":"0"}}),
        )]),
    };
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Combat',1000,$4)")
        .bind(u.0).bind(second.0).bind(second_event.0).bind(sqlx::types::Json(second_report)).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,1)",
    )
    .bind(second.0)
    .bind(a.player.0)
    .execute(&pool)
    .await
    .unwrap();
    // Stars protect against accidental archiving. Archiving/restoration preserve
    // active links, and neither action resurrects a previously revoked token.
    for (action, rejected, link_present) in [
        (
            WorldAction::SetReportsHidden {
                reports: vec![second, id],
                hidden: true,
            },
            true,
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
            WorldAction::SetReportsHidden {
                reports: vec![second, id, second],
                hidden: true,
            },
            false,
            true,
        ),
        (
            WorldAction::SetReportsHidden {
                reports: vec![second, id],
                hidden: false,
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
            true,
        ),
        (
            WorldAction::SetReportHidden {
                report: id,
                hidden: false,
            },
            false,
            true,
        ),
    ] {
        let command_id = CommandId(Uuid::new_v4());
        let envelope = |id, action| CommandEnvelopeV4 {
            protocol: 4,
            binding: a,
            command_id: id,
            command: CommandDto3::Progression(Command::World { action }),
        };
        let batch_hidden = match &action {
            WorldAction::SetReportsHidden { hidden, .. } => Some(*hidden),
            _ => None,
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
        if let Some(hidden) = batch_hidden {
            let second_hidden: bool = sqlx::query_scalar(
                "SELECT hidden FROM mission_report_recipients WHERE report=$1 AND recipient=$2",
            )
            .bind(second.0)
            .bind(a.player.0)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(second_hidden, !rejected && hidden);
            assert!(
                !store
                    .world_report(b, id)
                    .await
                    .unwrap()
                    .facts
                    .0
                    .header
                    .hidden
            );
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
        assert!(matches!(
            game.shared_report(token).await,
            Err(ServiceError::NotFound)
        ));
        let status = game
            .report_share(principal(a), id, request(a, ReportShareAction::Status))
            .await
            .unwrap();
        assert_eq!(status.token, Some(new_token));
        assert!(status.header.shared);
    }
    // An old archived recipient without a share stays unshared. Browse every
    // page, including archives, then revoke an active link while archived.
    sqlx::query(
        "UPDATE mission_report_recipients SET hidden=true WHERE report=ANY($1) AND recipient=$2",
    )
    .bind(vec![id.0, second.0])
    .bind(a.player.0)
    .execute(&pool)
    .await
    .unwrap();
    let mut query = ReportsQuery4 {
        context: QueryContext {
            binding: a,
            request_id: Uuid::new_v4(),
        },
        cursor: None,
        kind: None,
        limit: 1,
        include_hidden: true,
    };
    let mut archived = Vec::new();
    loop {
        let page = game
            .reports4(principal(a), query.clone())
            .await
            .unwrap()
            .facts
            .data;
        archived.extend(
            page.items
                .iter()
                .filter(|header| header.hidden)
                .map(|header| header.id),
        );
        if !page.has_more {
            break;
        }
        query.cursor = page.next_cursor;
    }
    assert!(archived.contains(&id));
    assert!(archived.contains(&second));
    let never_shared = game
        .report_share(principal(a), second, request(a, ReportShareAction::Status))
        .await
        .unwrap();
    assert_eq!(never_shared.token, None);
    game.report_share(principal(a), id, request(a, ReportShareAction::Revoke))
        .await
        .unwrap();
    assert!(matches!(
        game.shared_report(new_token).await,
        Err(ServiceError::NotFound)
    ));
    sqlx::query(
        "UPDATE mission_report_recipients SET hidden=false WHERE report=ANY($1) AND recipient=$2",
    )
    .bind(vec![id.0, second.0])
    .bind(a.player.0)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        game.report_share(principal(a), id, request(a, ReportShareAction::Status))
            .await
            .unwrap()
            .token,
        None
    );
    assert_eq!(
        game.report_share(principal(a), second, request(a, ReportShareAction::Status))
            .await
            .unwrap()
            .token,
        None
    );
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
    // Source reports cannot be removed while recipient rows exist. Physical
    // cleanup removes recipients first, which cascades to every shared link.
    let final_token = game
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
        .unwrap()
        .token
        .unwrap();
    let blocked = sqlx::query("DELETE FROM mission_reports WHERE id=$1")
        .bind(id.0)
        .execute(&pool)
        .await
        .unwrap_err();
    assert_eq!(
        blocked.as_database_error().unwrap().code().as_deref(),
        Some("23503")
    );
    assert!(game.shared_report(final_token).await.is_ok());
    sqlx::query("DELETE FROM mission_report_recipients WHERE report=$1")
        .bind(id.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM mission_reports WHERE id=$1")
        .bind(id.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        game.shared_report(final_token).await,
        Err(ServiceError::NotFound)
    ));
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM mission_report_shares WHERE report=$1")
            .bind(id.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
    pool.close().await;
}
