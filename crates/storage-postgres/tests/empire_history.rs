use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{
    MvpAccount, PgStore, record_campaign_closure, record_campaign_result,
};
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

struct Fixture {
    store: PgStore,
    pool: PgPool,
    a: Binding,
    b: Binding,
    login: LoginResult,
}
impl Fixture {
    async fn new() -> Self {
        let url = std::env::var("TEST_DATABASE_URL").unwrap();
        let store = PgStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        let universe = UniverseId(Uuid::new_v4());
        let accounts = std::array::from_fn(|i| MvpAccount {
            name: format!("history-{}-{i}", Uuid::new_v4()),
            password: Uuid::new_v4().to_string(),
        });
        store
            .bootstrap_mvp_fleets(universe, 1000, &accounts, &[93; 32])
            .await
            .unwrap();
        store.set_test_time(1000).await.unwrap();
        let login = SessionService::new(store.clone())
            .login(&accounts[0].name, &accounts[0].password, None)
            .await
            .unwrap();
        let other = SessionService::new(store.clone())
            .login(&accounts[1].name, &accounts[1].password, None)
            .await
            .unwrap();
        let a = store
            .current_binding(login.session.account, universe)
            .await
            .unwrap()
            .0;
        let b = store
            .current_binding(other.session.account, universe)
            .await
            .unwrap()
            .0;
        Self {
            store,
            pool: PgPool::connect(&url).await.unwrap(),
            a,
            b,
            login,
        }
    }
    async fn profile(&self, library: bool) -> EmpireProfile {
        self.store
            .empire_profile(
                Some(self.a.account),
                self.a.player.0,
                HistoryQuery {
                    library,
                    before: None,
                },
            )
            .await
            .unwrap()
    }
    async fn edit(&self, action: ProfileAction) {
        let p = self.profile(false).await;
        self.store
            .edit_empire_profile(
                self.a.account,
                self.a.player.0,
                ProfileCommand {
                    command_id: Uuid::new_v4(),
                    expected_revision: p.revision,
                    action,
                },
            )
            .await
            .unwrap();
    }
}
#[tokio::test]
async fn curated_history_survives_report_cleanup_empire_removal_closure_and_account_detachment() {
    let f = Fixture::new().await;
    let p = f.profile(true).await;
    assert_eq!(p.entries.len(), 1);
    assert_eq!(p.entries[0].kind, "Joined");
    assert_eq!(p.entries[0].at_ms, Some(1000));
    assert!(!p.public);
    assert!(f.profile(false).await.entries.is_empty());
    assert!(matches!(
        f.store
            .empire_profile(None, f.a.player.0, HistoryQuery::default())
            .await,
        Err(StoreError::NotFound)
    ));
    assert!(
        f.store
            .empire_profile(Some(f.b.account), f.a.player.0, HistoryQuery::default())
            .await
            .is_ok()
    );
    assert!(
        f.store
            .empire_profile(
                Some(f.b.account),
                f.a.player.0,
                HistoryQuery {
                    library: true,
                    before: None
                }
            )
            .await
            .is_err()
    );
    let report = Uuid::new_v4();
    let event = Uuid::new_v4();
    let payload = json!({"kind":"Combat","at":1100,"target":{"galaxy":1,"system":1,"position":2},"outcome":"DefenderVictory","participants":[{"owner":f.a.player,"side":"Attacker","origin":{"Fleet":Uuid::new_v4()},"units":[],"technology":[0,0,0]}],"SECRET":"never publish this"});
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$3,'Combat',1100,$4)")
        .bind(f.a.universe.0).bind(report).bind(Uuid::new_v4()).bind(json!({"payloads":{f.a.player.to_string():payload}})).execute(&f.pool).await.unwrap();
    sqlx::query("INSERT INTO empire_history(id,player,source,kind,at_ms,facts,report) VALUES($1,$2,'fixture','Battle',1100,$3,$4)")
        .bind(event).bind(f.a.player.0).bind(json!({"names":{f.a.player.to_string():"Historical Commander"},"valuation_before":[],"valuation_after":[]})).bind(report).execute(&f.pool).await.unwrap();
    assert!(
        f.store
            .history_detail(Some(f.b.account), event, false)
            .await
            .is_err()
    );
    f.edit(ProfileAction::Select {
        event,
        selected: true,
        caption: "A glorious defeat".into(),
        featured: true,
    })
    .await;
    f.edit(ProfileAction::Visibility { public: true }).await;
    let public = f
        .store
        .empire_profile(None, f.a.player.0, HistoryQuery::default())
        .await
        .unwrap();
    assert_eq!(public.entries.len(), 1);
    assert!(!public.owner);
    assert!(public.entries[0].facts.get("valuation_before").is_none());
    let q = || ProfileCommand {
        command_id: Uuid::nil(),
        expected_revision: public.revision,
        action: ProfileAction::Publish { event },
    };
    f.store
        .edit_empire_profile(f.b.account, f.a.player.0, q())
        .await
        .unwrap();
    f.store
        .edit_empire_profile(f.b.account, f.a.player.0, q())
        .await
        .unwrap();
    let published = f.profile(false).await.entries[0].publication.unwrap();
    f.edit(ProfileAction::Select {
        event,
        selected: false,
        caption: String::new(),
        featured: false,
    })
    .await;
    f.edit(ProfileAction::Visibility { public: false }).await;
    let detail = f.store.history_detail(None, published, true).await.unwrap();
    let wire = serde_json::to_string(&detail).unwrap();
    assert!(wire.contains("Historical Commander"));
    assert!(!wire.contains("SECRET"));
    assert_eq!(detail.entry.caption, "A glorious defeat");
    let mut tx = f.pool.begin().await.unwrap();
    let correction = Uuid::new_v4();
    let mut corrected = payload.clone();
    corrected["outcome"] = json!("Draw");
    orbit_storage_postgres::correct_history_event(
        &mut tx,
        event,
        correction,
        1150,
        "Corrected an imported outcome",
        json!({"outcome":"Draw"}),
        Some(corrected.clone()),
    )
    .await
    .unwrap();
    orbit_storage_postgres::correct_history_event(
        &mut tx,
        event,
        correction,
        1150,
        "Corrected an imported outcome",
        json!({"outcome":"Draw"}),
        Some(corrected),
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let corrected = f.store.history_detail(None, published, true).await.unwrap();
    assert_eq!(
        corrected.entry.correction.as_deref(),
        Some("Corrected an imported outcome")
    );
    assert_eq!(corrected.report.unwrap().payload["outcome"], "Draw");
    let original: String = sqlx::query_scalar(
        "SELECT data->'payloads'->$2->>'outcome' FROM mission_reports WHERE id=$1",
    )
    .bind(report)
    .bind(f.a.player.to_string())
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!(original, "DefenderVictory");

    // The archive references the canonical source; no orphan or second payload is possible.
    assert!(
        sqlx::query("DELETE FROM mission_reports WHERE id=$1")
            .bind(report)
            .execute(&f.pool)
            .await
            .is_err()
    );
    let source = Uuid::new_v4();
    let mut tx = f.pool.begin().await.unwrap();
    record_campaign_result(
        &mut tx,
        f.a.universe,
        f.a.epoch,
        source,
        1200,
        "Victory",
        &[f.b.player],
    )
    .await
    .unwrap();
    record_campaign_result(
        &mut tx,
        f.a.universe,
        f.a.epoch,
        source,
        1200,
        "Victory",
        &[f.b.player],
    )
    .await
    .unwrap();
    assert!(
        record_campaign_closure(&mut tx, f.a.universe, f.a.epoch, 1199)
            .await
            .is_err()
    );
    let late = Uuid::new_v4();
    sqlx::query("INSERT INTO empire_profiles(player,profile,universe,epoch,universe_name,recorded_name,joined_at) SELECT $1,profile,universe,epoch,universe_name,'Late entrant',1250 FROM empire_profiles WHERE player=$2")
        .bind(late).bind(f.a.player.0).execute(&mut *tx).await.unwrap();
    record_campaign_result(
        &mut tx,
        f.a.universe,
        f.a.epoch,
        source,
        1200,
        "Victory",
        &[f.b.player],
    )
    .await
    .unwrap();
    let late_results: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM empire_history WHERE player=$1 AND kind='CampaignResult'",
    )
    .bind(late)
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert_eq!(
        late_results, 0,
        "a result retry cannot admit later players into the historical roster"
    );
    sqlx::query("DELETE FROM empire_profiles WHERE player=$1")
        .bind(late)
        .execute(&mut *tx)
        .await
        .unwrap();
    record_campaign_closure(&mut tx, f.a.universe, f.a.epoch, 1300)
        .await
        .unwrap();
    tx.commit().await.unwrap();
    let p = f.profile(true).await;
    assert!(p.closed);
    assert_eq!(
        p.entries
            .iter()
            .filter(|e| e.kind == "CampaignResult")
            .count(),
        1
    );
    assert_eq!(
        p.entries
            .iter()
            .find(|e| e.kind == "CampaignResult")
            .unwrap()
            .facts["beneficiary"],
        false
    );
    sqlx::query("DELETE FROM universe_memberships WHERE player=$1")
        .bind(f.a.player.0)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(f.profile(true).await.removed);
    assert!(!f.profile(false).await.public);
    assert!(
        f.store
            .empire_profile(Some(f.b.account), f.a.player.0, HistoryQuery::default())
            .await
            .is_err()
    );
    assert!(f.store.history_detail(None, published, true).await.is_ok());
    assert!(f.store.orbit_profile(None, Some(p.profile)).await.is_err());
    assert_eq!(
        f.store
            .orbit_profile(Some(f.a.account), None)
            .await
            .unwrap()
            .empires
            .len(),
        1
    );
    // Account-removal integration detaches the account without erasing public game facts.
    sqlx::query("UPDATE orbit_profiles SET account=NULL WHERE id=$1")
        .bind(p.profile)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(
        f.store
            .empire_profile(Some(f.a.account), f.a.player.0, HistoryQuery::default())
            .await
            .is_err()
    );
    assert!(
        f.store
            .orbit_profile(Some(f.a.account), Some(p.profile))
            .await
            .is_err()
    );
    assert_eq!(
        f.store
            .history_detail(None, published, true)
            .await
            .unwrap()
            .entry
            .caption,
        "A glorious defeat"
    );
}
#[tokio::test]
async fn revisions_membership_epochs_and_paginated_selection_do_not_leak_history() {
    let f = Fixture::new().await;
    let p = f.profile(true).await;
    let event = p.entries[0].id;
    let q = || ProfileCommand {
        command_id: Uuid::new_v4(),
        expected_revision: 0,
        action: ProfileAction::Select {
            event,
            selected: true,
            caption: "First".into(),
            featured: false,
        },
    };
    let (a, b) = tokio::join!(
        f.store.edit_empire_profile(f.a.account, f.a.player.0, q()),
        f.store.edit_empire_profile(f.a.account, f.a.player.0, q())
    );
    assert_ne!(a.is_ok(), b.is_ok());
    let other = f
        .store
        .empire_profile(
            Some(f.b.account),
            f.b.player.0,
            HistoryQuery {
                library: true,
                before: None,
            },
        )
        .await
        .unwrap()
        .entries[0]
        .id;
    let bad = ProfileCommand {
        command_id: Uuid::new_v4(),
        expected_revision: 1,
        action: ProfileAction::Select {
            event: other,
            selected: true,
            caption: "Not mine".into(),
            featured: false,
        },
    };
    assert!(
        f.store
            .edit_empire_profile(f.a.account, f.a.player.0, bad)
            .await
            .is_err()
    );
    for i in 0..60 {
        sqlx::query(
            "INSERT INTO empire_history(player,source,kind,at_ms) VALUES($1,$2,'Colonized',$3)",
        )
        .bind(f.a.player.0)
        .bind(format!("page:{i}"))
        .bind(2000 + i as i64)
        .execute(&f.pool)
        .await
        .unwrap();
    }
    let first = f.profile(true).await;
    assert_eq!(first.entries.len(), 50);
    let second = f
        .store
        .empire_profile(
            Some(f.a.account),
            f.a.player.0,
            HistoryQuery {
                library: true,
                before: first.next,
            },
        )
        .await
        .unwrap();
    assert_eq!(second.entries.len(), 11);
    assert!(second.next.is_none());
    assert!(
        second
            .entries
            .iter()
            .all(|e| !first.entries.iter().any(|a| a.id == e.id))
    );
    assert_eq!(f.profile(false).await.entries.len(), 1);
    // A replacement epoch membership is not membership of the archived campaign.
    sqlx::query("UPDATE empire_profiles SET epoch=$2 WHERE player=$1")
        .bind(f.b.player.0)
        .bind(Uuid::new_v4())
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(
        f.store
            .empire_profile(Some(f.b.account), f.a.player.0, HistoryQuery::default())
            .await
            .is_err()
    );
}
#[tokio::test]
async fn http_requires_origin_csrf_and_owner_and_never_bootstraps_anonymous_gameplay() {
    let f = Fixture::new().await;
    let app = orbit_transport_http::router(
        f.store.clone(),
        orbit_transport_http::HttpConfig {
            origin: "http://localhost".into(),
            assets: "/absent".into(),
            login_per_minute: 100,
            signup: None,
            signup_per_minute: 100,
            legacy_signup_enabled: false,
            wake: None,
            observer: None,
        },
    );
    let uri = format!("/api/v4/empire-profiles/{}", f.a.player);
    let response = app
        .clone()
        .oneshot(Request::builder().uri(&uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    for csrf in [false, true] {
        let mut req = Request::builder()
            .uri(&uri)
            .method("POST")
            .header("content-type", "application/json")
            .header("cookie", format!("orbit_session={}", f.login.token))
            .header("origin", "http://localhost");
        if csrf {
            req = req.header("x-csrf-token", &f.login.session.csrf);
        }
        let response=app.clone().oneshot(req.body(Body::from(json!({"command_id":Uuid::new_v4(),"expected_revision":0,"action":{"type":"Visibility","public":true}}).to_string())).unwrap()).await.unwrap();
        assert_eq!(
            response.status(),
            if csrf {
                StatusCode::OK
            } else {
                StatusCode::FORBIDDEN
            }
        );
    }
    let response = app
        .clone()
        .oneshot(Request::builder().uri(&uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let data: serde_json::Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(data["owner"], false);
    assert!(data.get("account").is_none());
    let request=Request::builder().uri(&uri).method("POST").header("content-type","application/json").header("cookie",format!("orbit_session={}",f.login.token)).header("origin","http://evil.example").header("x-csrf-token",&f.login.session.csrf).body(Body::from(json!({"command_id":Uuid::new_v4(),"expected_revision":1,"action":{"type":"Visibility","public":false}}).to_string())).unwrap();
    assert_eq!(
        app.oneshot(request).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn alliance_transitions_capture_real_join_kick_and_disband_reasons_once() {
    let f = Fixture::new().await;
    let create = f
        .store
        .alliance_command(AllianceCommandRequest {
            context: QueryContext {
                binding: f.a,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: None,
            action: AllianceAction::Create {
                name: format!("History {}", Uuid::new_v4().simple()),
                tag: "HIST".into(),
            },
        })
        .await
        .unwrap();
    let alliance = create.alliance.unwrap();
    let join = AllianceCommandRequest {
        context: QueryContext {
            binding: f.b,
            request_id: Uuid::new_v4(),
        },
        command_id: Uuid::new_v4(),
        expected_revision: None,
        action: AllianceAction::Join { alliance },
    };
    // New alliances use application recruitment; explicitly change the ordinary policy.
    let changed = f
        .store
        .alliance_command(AllianceCommandRequest {
            context: QueryContext {
                binding: f.a,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: create.revision,
            action: AllianceAction::Update {
                alliance,
                name: "History alliance".into(),
                tag: "HIST".into(),
                public_text: String::new(),
                recruitment: orbit_engine::alliances::AllianceRecruitment::Open,
            },
        })
        .await
        .unwrap();
    let joined = f.store.alliance_command(join.clone()).await.unwrap();
    f.store.alliance_command(join).await.unwrap();
    assert!(joined.revision > changed.revision);
    f.store
        .alliance_command(AllianceCommandRequest {
            context: QueryContext {
                binding: f.a,
                request_id: Uuid::new_v4(),
            },
            command_id: Uuid::new_v4(),
            expected_revision: joined.revision,
            action: AllianceAction::Kick {
                alliance,
                player: f.b.player,
            },
        })
        .await
        .unwrap();
    let history = f
        .store
        .empire_profile(
            Some(f.b.account),
            f.b.player.0,
            HistoryQuery {
                library: true,
                before: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        history
            .entries
            .iter()
            .filter(|e| e.kind == "AllianceJoined")
            .count(),
        1
    );
    assert_eq!(
        history
            .entries
            .iter()
            .filter(|e| e.kind == "AllianceKicked")
            .count(),
        1
    );
}
