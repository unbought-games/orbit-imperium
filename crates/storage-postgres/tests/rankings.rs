use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{HttpConfig, router_with_profiles};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

async fn request(
    app: &Router,
    binding: Binding,
    cookie: &str,
    csrf: Option<&str>,
) -> (StatusCode, Value) {
    let mut request = Request::post(format!("/api/v4/universes/{}/rankings", binding.universe))
        .header("content-type", "application/json")
        .header("origin", "https://game.test")
        .header("cookie", cookie);
    if let Some(csrf) = csrf {
        request = request.header("x-csrf-token", csrf);
    }
    let response = app
        .clone()
        .oneshot(
            request
                .body(Body::from(
                    json!({"binding":binding,"request_id":Uuid::new_v4()}).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    if status == StatusCode::OK {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    (
        status,
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap(),
    )
}

#[tokio::test]
async fn rankings_use_committed_assets_and_current_memberships_with_bound_private_reads() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-rankings");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("ranking-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[79; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(login.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe,
    };
    let context = || QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    let before = game.rankings(principal, context()).await.unwrap();
    assert_eq!(before.players.len(), accounts.len());
    assert!(!before.processing_pending);
    let own = before
        .players
        .iter()
        .find(|p| p.player == binding.player)
        .unwrap();
    let view = game.world_view(principal, context()).await.unwrap();
    assert_eq!(
        own.points,
        (view.missions.score_value_micro.parse::<i64>().unwrap() / 1_000_000_000).to_string()
    );
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let foreign_u = UniverseId(Uuid::new_v4());
    let policy = store
        .ensure_signup_universe(Some(foreign_u), Default::default(), Some(10))
        .await
        .unwrap();
    store.enroll_oidc(binding.account, policy).await.unwrap();
    let foreign = game
        .current_binding(binding.account, foreign_u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .players
            .iter()
            .any(|p| p.player == foreign.player)
    );

    // Read-only requests must not admit commands, mutate activity, or write totals.
    let commands: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE universe=$1")
        .bind(universe.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let config = HttpConfig {
        origin: "https://game.test".into(),
        secure_cookies: true,
        assets: "missing".into(),
        login_per_minute: 30,
        signup: None,
        signup_per_minute: 5,
        legacy_signup_enabled: true,
        trusted_fly_proxies: vec![],
        wake: None,
        observer: None,
    };
    let (_tx, rx) = tokio::sync::watch::channel(false);
    let app = router_with_profiles(store.clone(), config, rx, None, None);
    let cookie = format!("orbit_session={}", login.token);
    let csrf = Some(login.session.csrf.as_str());
    assert_eq!(
        request(&app, binding, "", csrf).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, binding, &cookie, None).await.0,
        StatusCode::FORBIDDEN
    );
    let other = before
        .players
        .iter()
        .find(|p| p.player != binding.player)
        .unwrap()
        .player;
    assert_ne!(
        request(
            &app,
            Binding {
                player: other,
                ..binding
            },
            &cookie,
            csrf
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_ne!(
        request(
            &app,
            Binding {
                epoch: Epoch(Uuid::new_v4()),
                ..binding
            },
            &cookie,
            csrf
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, public) = request(&app, binding, &cookie, csrf).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(public.as_object().unwrap().len(), 8);
    assert!(public["baseline_at"].is_null());
    for row in public["players"].as_array().unwrap() {
        assert_eq!(row.as_object().unwrap().len(), 5);
        for field in ["player", "username", "points", "rank", "previous_rank"] {
            assert!(row.get(field).is_some());
        }
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM commands WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        commands
    );

    // The rankings profile source permits only current universe members and is bounded.
    let visible = game
        .visible_profile_players(
            principal,
            PlayerProfilesQuery {
                context: context(),
                source: ProfileSource::Rankings {
                    players: vec![other, foreign.player, PlayerId(Uuid::new_v4())],
                },
            },
        )
        .await
        .unwrap();
    assert!(visible.contains(&other));
    assert!(!visible.contains(&foreign.player));
    assert_eq!(visible.len(), 2);
    assert!(
        game.visible_profile_players(
            principal,
            PlayerProfilesQuery {
                context: context(),
                source: ProfileSource::Rankings {
                    players: vec![other; 51]
                }
            }
        )
        .await
        .is_err()
    );

    // Uncommitted valuation changes are invisible; later refresh sees the whole commit.
    let mut tx = pool.begin().await.unwrap();
    let lot = orbit_engine::AssetLot {
        id: orbit_engine::OperationId(Uuid::new_v4()),
        owner: binding.player,
        item: orbit_engine::CatalogKey::Ship(orbit_engine::ShipType::SmallCargo),
        level: None,
        location: orbit_engine::AssetLocation::Player,
        quantity: 2,
        unit_value_micro: 3_000_000_000,
        rules_hash: orbit_engine::Ruleset::mvp_fleets().unwrap().hash,
        source_operation: orbit_engine::OperationId(Uuid::new_v4()),
        acquired_at: 2000,
        acquired_sequence: 1,
    };
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
        .bind(universe.0)
        .bind(lot.id.to_string())
        .bind(sqlx::types::Json(&lot))
        .execute(&mut *tx)
        .await
        .unwrap();
    let during = game.rankings(principal, context()).await.unwrap();
    assert_eq!(
        during
            .players
            .iter()
            .find(|p| p.player == binding.player)
            .unwrap()
            .points,
        own.points
    );
    tx.commit().await.unwrap();
    store.set_test_time(2000).await.unwrap();
    let after = game.rankings(principal, context()).await.unwrap();
    assert_eq!(after.sampled_at, 2000);
    assert_eq!(
        after
            .players
            .iter()
            .find(|p| p.player == binding.player)
            .unwrap()
            .points,
        "6"
    );
    assert_eq!(own.points, "0");
    let event = Uuid::new_v4();
    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,2000,999,'{}','{}')").bind(event).bind(universe.0).execute(&pool).await.unwrap();
    assert!(
        game.rankings(principal, context())
            .await
            .unwrap()
            .processing_pending
    );
    sqlx::query("UPDATE scheduled_events SET cancelled=true WHERE id=$1")
        .bind(event)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .processing_pending
    );
    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND player=$2")
        .bind(universe.0)
        .bind(other.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !game
            .rankings(principal, context())
            .await
            .unwrap()
            .players
            .iter()
            .any(|p| p.player == other)
    );
    // The first daily source observation is immutable despite later score and
    // membership changes. All readers use yesterday's full roster, including
    // departed players, to derive historical shared ranks.
    assert!(after.baseline_at.is_none());
    let day = 86_400_000;
    store.set_test_time(day + 500).await.unwrap();
    let (one, two) = tokio::join!(
        game.rankings(principal, context()),
        game.rankings(principal, context())
    );
    for snapshot in [one.unwrap(), two.unwrap()] {
        assert_eq!(snapshot.baseline_at, Some(1000));
        assert!(snapshot.players.iter().all(|p| p.previous_rank == Some(1)));
        assert_eq!(
            snapshot
                .players
                .iter()
                .find(|p| p.player == binding.player)
                .unwrap()
                .rank,
            1
        );
        assert!(
            snapshot
                .players
                .iter()
                .filter(|p| p.player != binding.player)
                .all(|p| p.rank == 2)
        );
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ranking_observations WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
    let retained: Value = sqlx::query_scalar(
        "SELECT observation FROM ranking_observations WHERE universe=$1 AND day=0",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(retained.get("lots").is_some());
    assert!(retained.get("rank").is_none());
    assert!(retained.get("points").is_none());
    assert_eq!(
        retained["players"].as_array().unwrap().len(),
        accounts.len()
    );
    store.set_test_time(2 * day + 500).await.unwrap();
    let next = game.rankings(principal, context()).await.unwrap();
    assert_eq!(next.baseline_at, Some(day + 500));
    assert!(next.players.iter().all(|p| p.previous_rank == Some(p.rank)));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ranking_observations WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
    // A missed UTC day is explicitly unavailable, not an invented 24h delta.
    store.set_test_time(4 * day).await.unwrap();
    assert!(
        game.rankings(principal, context())
            .await
            .unwrap()
            .baseline_at
            .is_none()
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ranking_observations WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    pool.close().await;
}

#[tokio::test]
async fn alliance_scores_capture_membership_and_assets_together_and_keep_source_history() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-rankings");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("alliance-ranking-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[79; 32])
        .await
        .unwrap();
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(login.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe,
    };
    let context = || QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let players: Vec<Uuid> = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 ORDER BY player",
    )
    .bind(universe.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    let first = Uuid::from_u128(101);
    let second = Uuid::from_u128(102);
    for (id, leader, tag) in [(first, players[0], "ONE"), (second, players[2], "TWO")] {
        sqlx::query("INSERT INTO alliances(universe,epoch,id,name,tag,leader,recruitment,public_text,revision,roles,posts,audit) VALUES($1,$2,$3,$4,$4,$5,'Open','',1,'[]','[]','[]')")
            .bind(universe.0).bind(binding.epoch.0).bind(id).bind(tag).bind(leader).execute(&pool).await.unwrap();
    }
    for (index, player) in players.iter().take(3).enumerate() {
        sqlx::query("INSERT INTO alliance_memberships(universe,epoch,player,alliance,joined_at,roles) VALUES($1,$2,$3,$4,1000,'[]')")
            .bind(universe.0).bind(binding.epoch.0).bind(player).bind(if index < 2 { first } else { second }).execute(&pool).await.unwrap();
        let lot = orbit_engine::AssetLot {
            id: orbit_engine::OperationId(Uuid::new_v4()),
            owner: PlayerId(*player),
            item: orbit_engine::CatalogKey::Ship(orbit_engine::ShipType::SmallCargo),
            level: None,
            location: orbit_engine::AssetLocation::Player,
            quantity: 1,
            unit_value_micro: if index < 2 {
                600_000_000
            } else {
                1_900_000_000
            },
            rules_hash: orbit_engine::Ruleset::mvp_fleets().unwrap().hash,
            source_operation: orbit_engine::OperationId(Uuid::new_v4()),
            acquired_at: 1000,
            acquired_sequence: 1,
        };
        sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
            .bind(universe.0)
            .bind(lot.id.to_string())
            .bind(sqlx::types::Json(lot))
            .execute(&pool)
            .await
            .unwrap();
    }
    let before = game.rankings(principal, context()).await.unwrap();
    assert_eq!(
        before
            .alliances
            .iter()
            .map(|a| (
                a.alliance.id,
                a.member_count,
                a.points.as_str(),
                a.average_points.as_str(),
                a.rank
            ))
            .collect::<Vec<_>>(),
        vec![(first, 2, "1", "0", 1), (second, 1, "1", "1", 1)]
    );
    // Public summaries must derive the same global ranking without exposing a roster.
    for row in &before.alliances {
        let public = game
            .public_alliance(universe, row.alliance.id)
            .await
            .unwrap();
        let score = public
            .summary
            .ranking
            .as_ref()
            .expect("public ranking enrichment");
        assert_eq!(score.rank, u64::from(row.rank));
        assert_eq!(score.points, row.points);
        assert_eq!(score.average_points, row.average_points);
        assert_eq!(score.previous_rank, row.previous_rank.map(u64::from));
        assert_eq!(score.baseline_at, before.alliance_baseline_at);
        assert_eq!(public.summary.member_count, u64::from(row.member_count));
        let public_json = serde_json::to_value(&public).unwrap();
        assert_eq!(public_json.as_object().unwrap().len(), 2);
        for field in ["members", "leader", "roles", "activity"] {
            assert!(public_json["summary"].get(field).is_none());
        }
    }
    let serialized = serde_json::to_value(&before).unwrap();
    for row in serialized["alliances"].as_array().unwrap() {
        assert_eq!(row.as_object().unwrap().len(), 6);
        assert!(row.get("members").is_none());
    }
    assert!(
        before
            .players
            .iter()
            .find(|p| p.player.0 == players[1])
            .unwrap()
            .alliance
            .as_ref()
            .is_some_and(|a| a.id == first)
    );
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE alliance_memberships SET alliance=$1 WHERE universe=$2 AND player=$3")
        .bind(second)
        .bind(universe.0)
        .bind(players[1])
        .execute(&mut *tx)
        .await
        .unwrap();
    // Both membership and assets remain at their old committed state until commit.
    sqlx::query("UPDATE asset_lots SET data=jsonb_set(data,'{unit_value_micro}','3100000000') WHERE universe=$1 AND data->>'owner'=$2")
        .bind(universe.0).bind(players[2].to_string()).execute(&mut *tx).await.unwrap();
    let during = game.rankings(principal, context()).await.unwrap();
    assert_eq!(
        serde_json::to_value(&before.alliances).unwrap(),
        serde_json::to_value(&during.alliances).unwrap()
    );
    tx.commit().await.unwrap();
    store.set_test_time(2000).await.unwrap();
    let after = game.rankings(principal, context()).await.unwrap();
    assert_eq!(after.alliances[0].alliance.id, second);
    assert_eq!(after.alliances[0].member_count, 2);
    assert_eq!(after.alliances[0].points, "3");
    assert_eq!(after.alliances[1].points, "0");
    assert!(
        after
            .players
            .iter()
            .find(|p| p.player.0 == players[1])
            .unwrap()
            .alliance
            .as_ref()
            .is_some_and(|a| a.id == second)
    );
    let day = 86_400_000;
    store.set_test_time(day + 500).await.unwrap();
    let tomorrow = game.rankings(principal, context()).await.unwrap();
    assert_eq!(tomorrow.alliance_baseline_at, Some(1000));
    assert!(
        tomorrow
            .alliances
            .iter()
            .all(|a| a.previous_rank == Some(1))
    );
    let source: Value = sqlx::query_scalar(
        "SELECT observation FROM ranking_observations WHERE universe=$1 AND day=0",
    )
    .bind(universe.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        source["alliances"][0]["members"].as_array().unwrap().len(),
        2
    );
    assert_eq!(
        source["alliances"][1]["members"].as_array().unwrap().len(),
        1
    );
    assert!(source["alliances"][0].get("points").is_none());
    // Disband removes live rows while yesterday still supplies its original rank.
    sqlx::query("DELETE FROM alliances WHERE id=$1")
        .bind(second)
        .execute(&pool)
        .await
        .unwrap();
    let disbanded = game.rankings(principal, context()).await.unwrap();
    assert_eq!(disbanded.alliances.len(), 1);
    assert_eq!(disbanded.alliances[0].previous_rank, Some(1));
    assert!(
        disbanded
            .players
            .iter()
            .find(|p| p.player.0 == players[1])
            .unwrap()
            .alliance
            .is_none()
    );
    // An observation from before alliances were shipped cannot invent history.
    sqlx::query("UPDATE ranking_observations SET observation=observation-'alliances' WHERE universe=$1 AND day=1")
        .bind(universe.0).execute(&pool).await.unwrap();
    store.set_test_time(2 * day + 500).await.unwrap();
    let legacy = game.rankings(principal, context()).await.unwrap();
    assert_eq!(legacy.baseline_at, Some(day + 500));
    assert_eq!(legacy.alliance_baseline_at, None);
    assert!(legacy.alliances.iter().all(|a| a.previous_rank.is_none()));
    pool.close().await;
}
