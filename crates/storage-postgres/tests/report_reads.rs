//! Regression: the displayed selection is committed in one database operation,
//! without the gameplay request's 16 KiB limit or mutations outside the selection.
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_engine::ReportId;
use orbit_storage_postgres::{MvpAccount, PgStore};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn displayed_reports_are_atomic_private_idempotent_and_not_limited_to_400() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("read-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[93; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let sessions = SessionService::new(store.clone());
    let login = sessions
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let other = sessions
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
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let ids: Vec<_> = (0..5001).map(|_| Uuid::new_v4()).collect();
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) SELECT $1,id,id,'Espionage',1000,$3 FROM UNNEST($2::uuid[]) id")
        .bind(universe.0).bind(&ids).bind(json!({"payloads":{a.player.to_string():{"kind":"Espionage","resources":{"visibility":"Unknown"}}}}))
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO mission_report_recipients(report,recipient,created_revision,read,hidden,starred) SELECT id,$1,1,false,true,true FROM UNNEST($2::uuid[]) id")
        .bind(a.player.0).bind(&ids).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,1)",
    )
    .bind(ids[0])
    .bind(b.player.0)
    .execute(&pool)
    .await
    .unwrap();
    let foreign = Uuid::new_v4();
    sqlx::query("INSERT INTO mission_reports(universe,id,event,kind,at_ms,data) VALUES($1,$2,$2,'Espionage',1000,'{}')")
        .bind(universe.0).bind(foreign).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO mission_report_recipients(report,recipient,created_revision) VALUES($1,$2,1)",
    )
    .bind(foreign)
    .bind(b.player.0)
    .execute(&pool)
    .await
    .unwrap();
    let token = Uuid::new_v4();
    sqlx::query("INSERT INTO mission_report_shares(report,recipient,epoch,token,options,names_at_publication) VALUES($1,$2,$3,$4,$5,'{}')")
        .bind(ids[0]).bind(a.player.0).bind(a.epoch.0).bind(token).bind(json!({"include_identity":false,"include_coordinates":false}))
        .execute(&pool).await.unwrap();
    let app = orbit_transport_http::router(
        store.clone(),
        orbit_transport_http::HttpConfig {
            account_url: None,
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
    let request = |binding, reports: Vec<Uuid>, csrf: bool| {
        let mut req = Request::post(format!("/api/v4/universes/{universe}/reports/read"))
            .header("content-type", "application/json")
            .header("origin", "http://localhost")
            .header("cookie", format!("orbit_session={}", login.token));
        if csrf {
            req = req.header("x-csrf-token", &login.session.csrf);
        }
        req.body(Body::from(
            json!({"context":{"binding":binding,"request_id":Uuid::new_v4()},"reports":reports})
                .to_string(),
        ))
        .unwrap()
    };
    for (binding, reports, csrf, expected) in [
        (a, vec![ids[0]], false, StatusCode::FORBIDDEN),
        (b, vec![ids[0]], true, StatusCode::NOT_FOUND),
        (a, vec![ids[0], foreign], true, StatusCode::NOT_FOUND),
        (a, vec![ids[0], Uuid::new_v4()], true, StatusCode::NOT_FOUND),
        (
            Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..a
            },
            vec![ids[0]],
            true,
            StatusCode::CONFLICT,
        ),
        (a, vec![], true, StatusCode::BAD_REQUEST),
        (a, vec![ids[0]; 10001], true, StatusCode::BAD_REQUEST),
    ] {
        let response = app
            .clone()
            .oneshot(request(binding, reports, csrf))
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let read: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM mission_report_recipients WHERE recipient=$1 AND read",
        )
        .bind(a.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(read, 0, "a rejected batch must change nothing");
    }
    let mut shown = ids[..50].to_vec();
    shown.push(ids[0]); // duplicate selections are harmless
    let response = app.clone().oneshot(request(a, shown, true)).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let result: ReportsReadResult =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(result.items.len(), 50);
    assert!(result.items.iter().all(|h| h.read && h.hidden && h.starred));
    assert!(
        result
            .items
            .iter()
            .find(|h| h.id.0 == ids[0])
            .unwrap()
            .shared
    );
    let read: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM mission_report_recipients WHERE recipient=$1 AND read",
    )
    .bind(a.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(read, 50, "unloaded history remains unread");
    let mut last_revision = String::new();
    for retry in [false, true] {
        let response = app
            .clone()
            .oneshot(request(a, ids[..5000].to_vec(), true))
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "a large displayed list must not hit the old body limit"
        );
        let result: ReportsReadResult =
            serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes())
                .unwrap();
        assert_eq!(result.items.len(), 5000);
        assert!(result.items.iter().all(|h| h.read && h.hidden && h.starred));
        if retry {
            assert_eq!(
                result.viewer_revision, last_revision,
                "retry must not generate another invalidation"
            );
        }
        last_revision = result.viewer_revision;
    }
    for (recipient, report) in [(a.player, ids[5000]), (b.player, ids[0])] {
        let read: bool = sqlx::query_scalar(
            "SELECT read FROM mission_report_recipients WHERE recipient=$1 AND report=$2",
        )
        .bind(recipient.0)
        .bind(report)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            !read,
            "unselected reports and other recipients remain unchanged"
        );
    }
    let updates: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM game_updates WHERE universe=$1 AND player=$2 AND kind='invalidate'",
    )
    .bind(universe.0)
    .bind(a.player.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(updates, 2, "each real change invalidates other tabs");
    // Hold a concurrent archive/star change at its row lock, then release it
    // after the read transaction has demonstrably reached the same lock.
    let mut held = pool.begin().await.unwrap();
    sqlx::query("UPDATE mission_report_recipients SET hidden=false,starred=false WHERE recipient=$1 AND report=$2")
        .bind(a.player.0).bind(ids[5000]).execute(&mut *held).await.unwrap();
    let game = GameService::new(store.clone());
    let selected = ReportsReadRequest {
        context: QueryContext {
            binding: a,
            request_id: Uuid::new_v4(),
        },
        reports: vec![ReportId(ids[5000])],
    };
    let pending = tokio::spawn(async move {
        game.mark_reports_read(
            Principal {
                account: a.account,
                player: a.player,
                universe,
            },
            selected,
        )
        .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(30), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT p.report FROM mission_report_recipients%')")
                .fetch_one(&pool).await.unwrap();
            if waiting { break; }
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
    held.commit().await.unwrap();
    let result = pending.await.unwrap().unwrap();
    assert!(result.items[0].read && !result.items[0].hidden && !result.items[0].starred);
    pool.close().await;
}
