use http_body_util::BodyExt;
use orbit_application::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use orbit_transport_http::{
    HttpConfig, router,
    test_http::{Body, Request},
};
use tower::ServiceExt;
use uuid::Uuid;

#[tokio::test]
async fn anonymous_previews_expose_only_appearance_and_deleted_slots_remain_addressable() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-location_previews");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("preview-player-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[35; 32])
        .await
        .unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("UPDATE universes SET name='Preview Universe' WHERE id=$1")
        .bind(universe.0)
        .execute(&pool)
        .await
        .unwrap();
    let (body,galaxy,system,position):(Uuid,i32,i32,i32)=sqlx::query_as("SELECT id,galaxy,system,position FROM bodies WHERE universe=$1 AND kind='Planet' ORDER BY id LIMIT 1").bind(universe.0).fetch_one(&pool).await.unwrap();
    sqlx::query("UPDATE bodies SET name=$1 WHERE id=$2")
        .bind("Elysium <&\"")
        .bind(body)
        .execute(&pool)
        .await
        .unwrap();
    let at = LocationCoordinates {
        galaxy: galaxy as u32,
        system: system as u32,
        position: position as u32,
    };
    let view = store
        .location_appearance("preview-universe", at, LocationBodyKind::Planet)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(view.body.unwrap().id.0, body);
    assert!(
        store
            .location_appearance("missing", at, LocationBodyKind::Planet)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .location_appearance(
                "preview-universe",
                LocationCoordinates {
                    system: 999999,
                    ..at
                },
                LocationBodyKind::Planet
            )
            .await
            .unwrap()
            .is_none()
    );
    let moon = Uuid::new_v4();
    sqlx::query("INSERT INTO bodies(id,universe,owner,kind,galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,revision,name) SELECT $1,universe,owner,'Moon',galaxy,system,position,fields,max_temperature,amounts,carry,checkpoint_at,0,NULL FROM bodies WHERE id=$2").bind(moon).bind(body).execute(&pool).await.unwrap();
    assert_eq!(
        store
            .location_appearance("preview-universe", at, LocationBodyKind::Moon)
            .await
            .unwrap()
            .unwrap()
            .body
            .unwrap()
            .id
            .0,
        moon
    );
    let assets = concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/web/public");
    let temp = std::env::temp_dir().join(format!("orbit-location-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp).unwrap();
    std::fs::copy(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../apps/web/index.html"),
        temp.join("index.html"),
    )
    .unwrap();
    // A separate static root keeps fixture HTML independent of a frontend build.
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(format!("{assets}/art"), temp.join("art")).unwrap();
        std::os::unix::fs::symlink(
            format!("{assets}/brand-mark.svg"),
            temp.join("brand-mark.svg"),
        )
        .unwrap();
    }
    let app = router(
        store.clone(),
        HttpConfig {
            origin: "https://game.test".into(),
            assets: temp.to_string_lossy().into_owned(),
            login_per_minute: 30,
            signup: None,
            signup_per_minute: 5,
            legacy_signup_enabled: false,
            trusted_fly_proxies: vec![],
            wake: None,
            observer: None,
        },
    );
    let path = format!("/u/preview-universe/location/{galaxy}:{system}:{position}");
    for target in ["", "?target=moon", "?mission=attack"] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("{path}{target}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["cache-control"], "private, no-store");
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains("og:image"));
        assert!(html.contains("preview-player-"));
        assert!(!html.contains("password"));
        assert!(!html.contains("oidc_identity"));
        assert!(!html.contains("last_signal_at"));
        assert!(!html.contains("amounts"));
        if target.contains("moon") {
            assert!(html.contains("Moon ["));
            assert!(html.contains("preview.png?target=moon"))
        } else {
            assert!(html.contains("Elysium &lt;&amp;&quot;"));
        }
    }
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{path}/preview.png?target=moon"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-type"], "image/png");
    let png = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    // Removing the moon must never substitute the co-located planet.
    sqlx::query("DELETE FROM bodies WHERE id=$1")
        .bind(moon)
        .execute(&pool)
        .await
        .unwrap();
    let response = app
        .clone()
        .oneshot(
            Request::get(format!("{path}?target=moon"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let html = String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec(),
    )
    .unwrap();
    assert!(html.contains("Moon unavailable"));
    assert!(!html.contains("Elysium"));
    for address in ["0:1:1", "1:999999:1", "1:2:3:4"] {
        let response = app
            .clone()
            .oneshot(
                Request::get(format!("/u/preview-universe/location/{address}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
    }
    std::fs::remove_dir_all(temp).unwrap();
    pool.close().await;
}
