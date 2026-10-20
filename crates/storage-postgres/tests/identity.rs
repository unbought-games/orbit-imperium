use orbit_application::{Actor, GameService, IdentityStore, SessionService};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;

// Removing revocation or returning a credential record for an unknown name breaks this test.
#[tokio::test]
async fn seed_login_revocation_and_private_views() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make test-db (disposable PostgreSQL)");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let universe = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store
        .seed(universe, 1_000_000, 1, &passwords)
        .await
        .unwrap();
    assert!(
        store
            .seed(universe, 1_000_000, 1, &passwords)
            .await
            .is_err()
    );
    let service = SessionService::new(store.clone());
    assert!(service.login("unknown", &passwords[0], None).await.is_err());
    assert!(service.login("alpha", "incorrect", None).await.is_err());
    let alpha = service.login("alpha", &passwords[0], None).await.unwrap();
    assert_eq!(alpha.session.memberships.len(), 1);
    let old_epoch = GameService::new(store.clone())
        .view(Actor::Player(alpha.session.memberships[0].player), universe)
        .await
        .unwrap()
        .epoch;
    let authenticated = service.authenticate(&alpha.token).await.unwrap();
    assert_eq!(authenticated.account, alpha.session.account);
    service.logout(&alpha.token).await.unwrap();
    assert!(service.authenticate(&alpha.token).await.is_err());
    assert!(store.find_credentials("unknown").await.unwrap().is_none());
    let guard = store.server_guard(1).await.unwrap();
    assert!(
        store
            .reset(universe, 2_000_000, 1, &passwords)
            .await
            .is_err()
    );
    drop(guard);
    assert!(store.server_guard(4).await.is_err());
    store
        .reset(universe, 2_000_000, 1, &passwords)
        .await
        .unwrap();
    assert!(service.authenticate(&alpha.token).await.is_err());
    let new_session = service.login("alpha", &passwords[0], None).await.unwrap();
    let new_epoch = GameService::new(store.clone())
        .view(
            Actor::Player(new_session.session.memberships[0].player),
            universe,
        )
        .await
        .unwrap()
        .epoch;
    assert_ne!(old_epoch, new_epoch);
}
