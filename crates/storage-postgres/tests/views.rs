use orbit_application::{Actor, GameService, SessionService};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn overview_contains_only_own_inventory() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &passwords).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let sessions = SessionService::new(store.clone());
    let a = sessions.login("alpha", &passwords[0], None).await.unwrap();
    let b = sessions.login("beta", &passwords[1], None).await.unwrap();
    let service = GameService::new(store);
    let av = service
        .view(Actor::Player(a.session.memberships[0].player), u)
        .await
        .unwrap();
    let bv = service
        .view(Actor::Player(b.session.memberships[0].player), u)
        .await
        .unwrap();
    assert_eq!(av.bodies.len(), 1);
    assert_eq!(av.destinations.len(), 2);
    assert_ne!(av.bodies[0].id, bv.bodies[0].id);
    assert_eq!(av.bodies[0].amounts.metal, "1000000000");
    let wire = serde_json::to_value(av).unwrap();
    assert!(wire.get("sequence").is_none());
    assert!(wire.get("password_hash").is_none());
    assert!(
        service
            .view(
                Actor::Player(b.session.memberships[0].player),
                Uuid::new_v4().into()
            )
            .await
            .is_err()
    );
    // Legacy capacity is saved authority, including values unlike any current
    // profile's storage table; reopening must keep the view and settlement cap.
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("UPDATE legacy_body_capacities SET capacity=$1")
        .bind(serde_json::json!({"metal":1050000000,"crystal":1500000000,"deuterium":2000000000}))
        .execute(&pool)
        .await
        .unwrap();
    let reopened = PgStore::connect(&url).await.unwrap();
    reopened.set_test_time(4_600_000).await.unwrap();
    let service = GameService::new(reopened);
    let view = service
        .view(Actor::Player(a.session.memberships[0].player), u)
        .await
        .unwrap();
    assert_eq!(view.bodies[0].capacity.metal, "1050000000");
    assert_eq!(view.bodies[0].capacity.crystal, "1500000000");
    assert_eq!(view.bodies[0].amounts.metal, "1050000000");
    assert_eq!(view.bodies[0].amounts.crystal, "1037000000");
    sqlx::query("DELETE FROM legacy_body_capacities")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        service
            .view(Actor::Player(a.session.memberships[0].player), u)
            .await
            .is_err()
    );
}
