use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode},
};
use http_body_util::BodyExt;
use orbit_application::*;
use orbit_engine::{AssetLocation, AssetLot, CatalogKey, OperationId, Ruleset, ShipType};
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{HttpConfig, router};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use tower::ServiceExt;
use uuid::Uuid;

async fn setup() -> (PgStore, sqlx::PgPool, UniverseId, Router) {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-public_universe");
    let cleanup_pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
        .execute(&cleanup_pool)
        .await
        .unwrap();
    cleanup_pool.close().await;
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("public-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[85; 32])
        .await
        .unwrap();
    let app = router(
        store.clone(),
        HttpConfig {
            origin: "https://game.test".into(),
            assets: "missing".into(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: true,
            wake: None,
            observer: None,
        },
    );
    (
        store,
        sqlx::PgPool::connect(&url).await.unwrap(),
        universe,
        app,
    )
}
async fn request(
    app: &Router,
    path: &str,
    headers: &[(&str, &str)],
) -> (StatusCode, HeaderMap, Value) {
    let mut request = Request::get(path);
    for (k, v) in headers {
        request = request.header(*k, *v);
    }
    let response = app
        .clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        headers,
        if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        },
    )
}
async fn publish(store: &PgStore, u: UniverseId, feed: PublicFeed) -> PublicObservation {
    let claim = store
        .claim_publication(u, feed)
        .await
        .unwrap()
        .expect("due publication");
    let source = store.sample_publication(&claim).await.unwrap();
    store.commit_publication(&claim, &source).await.unwrap();
    source
}
/// Compare every non-publication persisted table, including presence, bots, events,
/// inventories, ranking history, receipts, and revisions. No side effects hide in counts.
async fn game_facts(pool: &sqlx::PgPool) -> BTreeMap<String, Value> {
    let tables:Vec<String> = sqlx::query_scalar("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'public_feed_%' AND tablename<>'orbit_test_clock' ORDER BY tablename")
        .fetch_all(pool).await.unwrap();
    let mut result = BTreeMap::new();
    for table in tables {
        let value:Value = sqlx::query_scalar(&format!("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM \"{table}\" t"))
            .fetch_one(pool).await.unwrap();
        result.insert(table, value);
    }
    result
}
fn keys(value: &Value, expected: &[&str]) {
    let mut actual = value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let mut expected = expected.to_vec();
    actual.sort();
    expected.sort();
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn public_feeds_publish_atomic_committed_facts_on_independent_schedules() {
    let (store, pool, u, app) = setup().await;
    let players_url = format!("/api/public/v1/universes/{u}/players");
    let planets_url = format!("/api/public/v1/universes/{u}/planets");
    let initial = game_facts(&pool).await;
    for feed in PublicFeed::ALL {
        assert!(store.claim_publication(u, feed).await.unwrap().is_none());
    }
    let (status, headers, _) = request(&app, &players_url, &[]).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(headers["access-control-allow-origin"], "*");
    assert_eq!(
        request(&app, &planets_url, &[]).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(initial, game_facts(&pool).await);
    assert_eq!(
        request(
            &app,
            &format!("/api/public/v1/universes/{}/players", Uuid::new_v4()),
            &[]
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(&app, "/api/public/v1/universes/bad/players", &[])
            .await
            .0,
        StatusCode::BAD_REQUEST
    );
    let preflight = app
        .clone()
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri(&players_url)
                .header("origin", "https://community.test")
                .header("access-control-request-headers", "if-none-match")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preflight.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        preflight.headers()["access-control-allow-headers"],
        "If-None-Match"
    );

    store.set_test_time(3_599_999).await.unwrap();
    assert!(
        store
            .claim_publication(u, PublicFeed::Players)
            .await
            .unwrap()
            .is_none()
    );
    store.set_test_time(3_600_000).await.unwrap();
    let (a, b) = tokio::join!(
        store.claim_publication(u, PublicFeed::Players),
        store.claim_publication(u, PublicFeed::Players)
    );
    let claims = [a.unwrap(), b.unwrap()];
    assert_eq!(claims.iter().flatten().count(), 1);
    let claim = claims.into_iter().flatten().next().unwrap();
    let source = store.sample_publication(&claim).await.unwrap();
    assert_eq!(
        request(&app, &players_url, &[]).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    store.commit_publication(&claim, &source).await.unwrap();
    assert!(matches!(
        store.commit_publication(&claim, &source).await,
        Err(StoreError::StaleClaim)
    ));
    assert!(
        store
            .claim_publication(u, PublicFeed::Planets)
            .await
            .unwrap()
            .is_none()
    );
    let (status, headers, first) = request(&app, &players_url, &[]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers["cache-control"],
        "public, no-cache, max-age=0, must-revalidate"
    );
    let etag = headers["etag"].to_str().unwrap().to_owned();
    assert_eq!(
        request(
            &app,
            &players_url,
            &[("if-none-match", &format!("\"old\", W/{etag}"))]
        )
        .await
        .0,
        StatusCode::NOT_MODIFIED
    );
    assert_eq!(first["sampled_at"], 3_600_000);
    assert_eq!(first["next_refresh_at"], 7_200_000);
    keys(
        &first,
        &[
            "schema_version",
            "universe",
            "epoch",
            "sampled_at",
            "next_refresh_at",
            "players",
        ],
    );
    assert_eq!(first["players"].as_array().unwrap().len(), 5);
    for player in first["players"].as_array().unwrap() {
        keys(
            player,
            &["player_id", "username", "points", "rank", "alliance"],
        );
        assert_eq!(player["points"], "0");
        assert_eq!(player["rank"], 1);
        assert!(player["alliance"].is_null());
    }
    assert_eq!(initial, game_facts(&pool).await);
    let PublicSource::Players { names, lots, .. } = source.source else {
        panic!()
    };
    let ranked = rank_players(names, lots).unwrap();
    assert_eq!(first["players"][0]["player_id"], json!(ranked[0].player));

    // An in-flight transaction is absent as a whole; the next sample sees both
    // identity and valuation committed together, never half of this change.
    let player: PlayerId =
        serde_json::from_value(first["players"][0]["player_id"].clone()).unwrap();
    let lot = AssetLot {
        id: OperationId(Uuid::new_v4()),
        owner: player,
        item: CatalogKey::Ship(ShipType::SmallCargo),
        level: None,
        location: AssetLocation::Player,
        quantity: 2,
        unit_value_micro: 3_000_000_000,
        rules_hash: Ruleset::mvp_fleets().unwrap().hash.clone(),
        source_operation: OperationId(Uuid::new_v4()),
        acquired_at: 1000,
        acquired_sequence: 1,
    };
    let mut tx = pool.begin().await.unwrap();
    sqlx::query("UPDATE accounts SET name='Renamed' WHERE id=(SELECT account FROM universe_memberships WHERE universe=$1 AND player=$2)").bind(u.0).bind(player.0).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO asset_lots(universe,key,data) VALUES($1,$2,$3)")
        .bind(u.0)
        .bind(lot.id.to_string())
        .bind(json!(lot))
        .execute(&mut *tx)
        .await
        .unwrap();
    store.set_test_time(7_200_000).await.unwrap();
    let claim = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    let before_commit = store.sample_publication(&claim).await.unwrap();
    let PublicUniverseResponse::Players(before) = before_commit.project().unwrap() else {
        panic!()
    };
    assert!(
        before
            .players
            .iter()
            .all(|p| p.username != "Renamed" && p.points == "0")
    );
    tx.commit().await.unwrap();
    let sampled = store.sample_publication(&claim).await.unwrap();
    let PublicSource::Players { names, lots, .. } = &sampled.source else {
        panic!()
    };
    let expected = rank_players(names.clone(), lots.clone()).unwrap();
    let unchanged = game_facts(&pool).await;
    store.commit_publication(&claim, &sampled).await.unwrap();
    let (_, headers, second) = request(&app, &players_url, &[("if-none-match", &etag)]).await;
    assert_ne!(headers["etag"], etag);
    assert_eq!(second["players"][0]["username"], "Renamed");
    assert_eq!(second["players"][0]["points"], "6");
    for (actual, expected) in second["players"].as_array().unwrap().iter().zip(expected) {
        assert_eq!(actual["points"], expected.points);
        assert_eq!(actual["rank"], expected.rank);
    }
    assert_eq!(
        second,
        request(
            &app,
            &format!("{players_url}?fresh=true"),
            &[
                ("authorization", "Bearer irrelevant"),
                ("cookie", "orbit_session=irrelevant"),
                ("origin", "https://community.test")
            ]
        )
        .await
        .2
    );
    assert_eq!(unchanged, game_facts(&pool).await);

    // Bounded retry budget survives other callers and retains the old publication.
    store.set_test_time(10_800_000).await.unwrap();
    let mut at = 10_800_000;
    for (attempt, delay) in [(1, 1000), (2, 5000), (3, 30_000), (4, 0)] {
        let claim = store
            .claim_publication(u, PublicFeed::Players)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(claim.attempt, attempt);
        store
            .fail_publication(&claim, &StoreError::Unavailable)
            .await
            .unwrap();
        assert!(
            store
                .claim_publication(u, PublicFeed::Players)
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(second, request(&app, &players_url, &[]).await.2);
        if delay > 0 {
            store.set_test_time(at + delay - 1).await.unwrap();
            assert!(
                store
                    .claim_publication(u, PublicFeed::Players)
                    .await
                    .unwrap()
                    .is_none()
            );
            at += delay;
            store.set_test_time(at).await.unwrap();
        }
    }
    store.set_test_time(14_400_000).await.unwrap();
    let claim = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claim.attempt, 1);
    store
        .fail_publication(&claim, &StoreError::Unavailable)
        .await
        .unwrap();
    store.set_test_time(14_401_000).await.unwrap();
    let source = publish(&store, u, PublicFeed::Players).await;
    assert_eq!(source.sampled_at, 14_401_000);
    assert_eq!(
        request(&app, &players_url, &[]).await.2["next_refresh_at"],
        18_000_000
    );

    store.set_test_time(86_399_999).await.unwrap();
    assert!(
        store
            .claim_publication(u, PublicFeed::Planets)
            .await
            .unwrap()
            .is_none()
    );
    store.set_test_time(86_400_000).await.unwrap();
    let before = game_facts(&pool).await;
    publish(&store, u, PublicFeed::Planets).await;
    let (_, _, planets) = request(&app, &planets_url, &[]).await;
    keys(
        &planets,
        &[
            "schema_version",
            "universe",
            "epoch",
            "sampled_at",
            "next_refresh_at",
            "planets",
        ],
    );
    for planet in planets["planets"].as_array().unwrap() {
        keys(
            planet,
            &["planet_id", "name", "coordinates", "owner_player_id"],
        );
        keys(&planet["coordinates"], &["galaxy", "system", "position"]);
    }
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM bodies WHERE universe=$1 AND kind='Planet'")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(planets["planets"].as_array().unwrap().len() as i64, count);
    assert_eq!(planets["next_refresh_at"], 172_800_000);
    assert_eq!(before, game_facts(&pool).await);

    // Resets invalidate HTTP validators and in-flight publication tokens.
    let old = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    let stale = store.sample_publication(&old).await.unwrap();
    let epoch = Uuid::new_v4();
    sqlx::query("UPDATE universes SET epoch=$2 WHERE id=$1")
        .bind(u.0)
        .bind(epoch)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        store.commit_publication(&old, &stale).await,
        Err(StoreError::EpochChanged)
    ));
    for url in [&players_url, &planets_url] {
        assert_eq!(
            request(&app, url, &[("if-none-match", "*")]).await.0,
            StatusCode::SERVICE_UNAVAILABLE
        );
    }
    for feed in PublicFeed::ALL {
        assert!(store.claim_publication(u, feed).await.unwrap().is_none());
    }
    store.set_test_time(90_000_000).await.unwrap();
    publish(&store, u, PublicFeed::Players).await;
    assert_eq!(
        request(&app, &players_url, &[]).await.2["epoch"],
        epoch.to_string()
    );
    assert_eq!(
        request(&app, &planets_url, &[]).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    let health = store.public_feed_health().await.unwrap();
    assert_eq!(
        health
            .iter()
            .find(|h| h.universe == u && h.feed == PublicFeed::Players)
            .unwrap()
            .sampled_at,
        Some(90_000_000)
    );
    assert_eq!(
        health
            .iter()
            .find(|h| h.universe == u && h.feed == PublicFeed::Planets)
            .unwrap()
            .sampled_at,
        None
    );

    // Ordinary availability limits carry browser-readable retry information.
    let mut limited = false;
    for _ in 0..121 {
        let (status, headers, _) = request(&app, &players_url, &[]).await;
        if status == StatusCode::TOO_MANY_REQUESTS {
            assert!(headers.contains_key("retry-after"));
            assert_eq!(headers["access-control-allow-origin"], "*");
            limited = true;
            break;
        }
    }
    assert!(limited);
}

#[tokio::test]
async fn expired_claims_rollback_failures_and_public_identity_changes() {
    let (store, pool, u, app) = setup().await;
    let players_url = format!("/api/public/v1/universes/{u}/players");
    let planets_url = format!("/api/public/v1/universes/{u}/planets");
    for feed in PublicFeed::ALL {
        assert!(store.claim_publication(u, feed).await.unwrap().is_none());
    }
    let players: Vec<Uuid> = sqlx::query_scalar(
        "SELECT player FROM universe_memberships WHERE universe=$1 ORDER BY player",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    let epoch: Uuid = sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    let alliance = Uuid::new_v4();
    sqlx::query("INSERT INTO alliances(universe,epoch,id,name,tag,leader,recruitment,public_text,revision,roles,posts,audit) VALUES($1,$2,$3,'Free Stars','STAR',$4,'Open','private-to-this-feed',1,'[]','[]','[]')").bind(u.0).bind(epoch).bind(alliance).bind(players[0]).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO alliance_memberships(universe,epoch,player,alliance,joined_at,roles) VALUES($1,$2,$3,$4,1000,'[]')").bind(u.0).bind(epoch).bind(players[0]).bind(alliance).execute(&pool).await.unwrap();
    // A moon sharing coordinates and an abandoned body have no public planet rows.
    let moon = Uuid::new_v4();
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,name) SELECT $2,universe,owner,'Moon',galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,NULL FROM bodies WHERE universe=$1 ORDER BY id LIMIT 1").bind(u.0).bind(moon).execute(&pool).await.unwrap();
    let colony = Uuid::new_v4();
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,name) SELECT $2,universe,owner,'Planet',1,5,15,fields,max_temperature,amounts,carry,checkpoint_at,'Old Colony' FROM bodies WHERE universe=$1 AND owner=$3 ORDER BY id LIMIT 1").bind(u.0).bind(colony).bind(players[4]).execute(&pool).await.unwrap();
    store.set_test_time(86_400_000).await.unwrap();
    let expired = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    let source = store.sample_publication(&expired).await.unwrap();
    store.set_test_time(86_520_000).await.unwrap();
    let claim = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(claim.attempt, 2);
    assert!(matches!(
        store.commit_publication(&expired, &source).await,
        Err(StoreError::StaleClaim)
    ));
    let source = store.sample_publication(&claim).await.unwrap();
    store.commit_publication(&claim, &source).await.unwrap();
    let (_, _, first) = request(&app, &players_url, &[]).await;
    let affiliated = first["players"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["player_id"] == players[0].to_string())
        .unwrap();
    assert_eq!(
        affiliated["alliance"],
        json!({"id":alliance,"name":"Free Stars","tag":"STAR"})
    );
    keys(&affiliated["alliance"], &["id", "name", "tag"]);
    publish(&store, u, PublicFeed::Planets).await;
    let (_, _, old_planets) = request(&app, &planets_url, &[]).await;
    assert!(
        old_planets["planets"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["planet_id"] != moon.to_string())
    );
    assert!(
        old_planets["planets"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["planet_id"] == colony.to_string())
    );
    // Rename, ownership and body replacement stay hidden until the next planet publication.
    let replacement = Uuid::new_v4();
    sqlx::query("UPDATE bodies SET name='New Colony',owner=$3,id=$4 WHERE universe=$1 AND id=$2")
        .bind(u.0)
        .bind(colony)
        .bind(players[3])
        .bind(replacement)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND player=$2")
        .bind(u.0)
        .bind(players[4])
        .execute(&pool)
        .await
        .unwrap();
    store.set_test_time(90_000_000).await.unwrap();
    let claim = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    let source = store.sample_publication(&claim).await.unwrap();
    // Force the publication write to fail after releasing its claim token.
    // The entire transaction must roll back, leaving the previous body untouched.
    sqlx::raw_sql("CREATE FUNCTION reject_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture publication failure'; END $$; CREATE TRIGGER reject_publication BEFORE INSERT OR UPDATE ON public_feed_observations FOR EACH ROW EXECUTE FUNCTION reject_publication();").execute(&pool).await.unwrap();
    let error = store.commit_publication(&claim, &source).await.unwrap_err();
    assert_eq!(request(&app, &players_url, &[]).await.2, first);
    let token: Option<Uuid> = sqlx::query_scalar(
        "SELECT token FROM public_feed_jobs WHERE universe=$1 AND feed='players'",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(token.is_some());
    store.fail_publication(&claim, &error).await.unwrap();
    sqlx::raw_sql("DROP TRIGGER reject_publication ON public_feed_observations; DROP FUNCTION reject_publication();").execute(&pool).await.unwrap();
    store.set_test_time(90_001_000).await.unwrap();
    publish(&store, u, PublicFeed::Players).await;
    let (_, _, new_players) = request(&app, &players_url, &[]).await;
    assert!(
        new_players["players"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["player_id"] != players[4].to_string())
    );
    assert_eq!(request(&app, &planets_url, &[]).await.2, old_planets);
    assert!(
        old_planets["planets"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["owner_player_id"] == players[4].to_string())
    );
    let health = store.public_feed_health().await.unwrap();
    assert_eq!(
        health
            .iter()
            .find(|h| h.universe == u && h.feed == PublicFeed::Planets)
            .unwrap()
            .next_refresh_at,
        Some(172_800_000)
    );
    store.set_test_time(172_800_000).await.unwrap();
    publish(&store, u, PublicFeed::Planets).await;
    let (_, _, latest) = request(&app, &planets_url, &[]).await;
    assert!(
        latest["planets"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["planet_id"] != colony.to_string())
    );
    let replaced = latest["planets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["planet_id"] == replacement.to_string())
        .unwrap();
    assert_eq!(replaced["name"], "New Colony");
    assert_eq!(replaced["owner_player_id"], players[3].to_string());
    // A nontransient invalid snapshot must not replace a valid publication.
    let claim = store
        .claim_publication(u, PublicFeed::Players)
        .await
        .unwrap()
        .unwrap();
    sqlx::query("UPDATE asset_lots SET data='{}' WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    // Seed fixtures can have no valued lots: explicitly inject invalid source data.
    sqlx::query(
        "INSERT INTO asset_lots(universe,key,data) VALUES($1,'corrupt-publication-fixture','{}')",
    )
    .bind(u.0)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store.sample_publication(&claim).await,
        Err(StoreError::CorruptData)
    ));
    store
        .fail_publication(&claim, &StoreError::CorruptData)
        .await
        .unwrap();
    assert!(
        store
            .claim_publication(u, PublicFeed::Players)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(request(&app, &players_url, &[]).await.2, new_players);
}
