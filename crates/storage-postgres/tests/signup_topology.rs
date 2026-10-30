use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use sqlx::PgPool;
use uuid::Uuid;

fn registration(policy: SignupPolicy, password_hash: &str) -> Registration {
    Registration {
        name: format!("topology-{}", Uuid::new_v4()),
        password_hash: password_hash.into(),
        policy,
        digest: Uuid::new_v4().to_string(),
        csrf: Uuid::new_v4().to_string(),
        previous: None,
    }
}

#[tokio::test]
async fn configured_round_admits_100_players_and_retains_topology_on_restart() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let options = UniverseOptions {
        galaxies: Some(1),
        systems_per_galaxy: Some(100),
        positions_per_system: Some(15),
    };
    let policy = store
        .ensure_signup_universe(Some(u), options, Some(100))
        .await
        .unwrap();
    let (secret, epoch): (Vec<u8>, Uuid) = sqlx::query_as(
        "SELECT secret,epoch FROM mvp_bootstraps JOIN universes ON id=universe WHERE universe=$1",
    )
    .bind(u.0)
    .fetch_one(&pool)
    .await
    .unwrap();
    let profile = store
        .load_rules(u)
        .await
        .unwrap()
        .artifact
        .universe
        .unwrap();
    let mut expected_homes = vec![];
    for ordinal in 0..100 {
        expected_homes.push(
            neighborhood_homeworld(
                secret.as_slice().try_into().unwrap(),
                u,
                epoch.into(),
                &profile,
                ordinal,
                &expected_homes,
                &expected_homes,
            )
            .unwrap()
            .coordinates,
        );
    }
    let mut expected_counts = std::collections::BTreeMap::new();
    for home in &expected_homes {
        *expected_counts
            .entry((home.galaxy, home.system))
            .or_insert(0i64) += 1;
    }
    let password_hash = hash_password("p").unwrap();
    let first = store
        .register(registration(policy, &password_hash))
        .await
        .unwrap();
    for _ in 1..99 {
        store
            .register(registration(policy, &password_hash))
            .await
            .unwrap();
    }
    let (a, b) = tokio::join!(
        store.register(registration(policy, &password_hash)),
        store.register(registration(policy, &password_hash))
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(
        a.err().or(b.err()),
        Some(StoreError::UniverseFull)
    ));
    let counts: Vec<i64> = sqlx::query_scalar("SELECT count(*) FROM bodies WHERE universe=$1 GROUP BY galaxy,system ORDER BY galaxy,system")
        .bind(u.0).fetch_all(&pool).await.unwrap();
    // Neighborhood occupancy is seeded, not the legacy fixed 23-system prefix.
    // Verify the exact expected distribution, not just relaxed count bounds.
    assert_eq!(
        counts,
        expected_counts.values().copied().collect::<Vec<_>>()
    );
    assert_eq!(counts.iter().sum::<i64>(), 100);
    assert!(counts.iter().all(|&n| n <= 9));
    let before: Vec<(Uuid, i32, i32, i32)> = sqlx::query_as(
        "SELECT id,galaxy,system,position FROM bodies WHERE universe=$1 ORDER BY id",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    let actual: std::collections::BTreeSet<_> = before
        .iter()
        .map(|b| Coordinates {
            galaxy: b.1 as u32,
            system: b.2 as u32,
            position: b.3 as u32,
        })
        .collect();
    assert_eq!(actual.len(), 100);
    assert_eq!(actual, expected_homes.into_iter().collect());
    assert!(
        actual
            .iter()
            .all(|c| c.galaxy == 1 && (4..=12).contains(&c.position))
    );
    let span = actual.iter().map(|c| c.system).max().unwrap()
        - actual.iter().map(|c| c.system).min().unwrap()
        + 1;
    assert!(
        span <= 50,
        "100 players have a 50-system neighborhood budget"
    );
    let reopened = PgStore::connect(&url).await.unwrap();
    let retained = reopened
        .ensure_signup_universe(Some(u), Default::default(), None)
        .await
        .unwrap();
    assert_eq!(retained.max_players, 900);
    assert_eq!(
        reopened
            .ensure_signup_universe(Some(u), options, Some(100))
            .await
            .unwrap()
            .universe,
        u
    );
    assert!(
        reopened
            .ensure_signup_universe(
                Some(u),
                UniverseOptions {
                    systems_per_galaxy: Some(99),
                    ..Default::default()
                },
                None
            )
            .await
            .is_err()
    );
    assert!(
        reopened
            .ensure_signup_universe(Some(u), Default::default(), Some(901))
            .await
            .is_err()
    );
    drop(reopened.server_guard_config(None).await.unwrap());
    let after: Vec<(Uuid, i32, i32, i32)> = sqlx::query_as(
        "SELECT id,galaxy,system,position FROM bodies WHERE universe=$1 ORDER BY id",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(before, after);
    // Exercise the gameplay loader, not just account creation: the old closure
    // rejected any universe with more than 45 owners.
    let game = GameService::new(reopened.clone());
    let binding = game
        .current_binding(first.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe: u,
    };
    let view = game
        .world_view(
            principal,
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert_eq!(view.progression.bodies.len(), 1);
    let settings = game
        .bound_settings(
            principal,
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        (
            settings.galaxies,
            settings.systems_per_galaxy,
            settings.positions_per_system
        ),
        (1, 100, 15)
    );
    game.world_query(
        principal,
        WorldQuery {
            context: QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
            query: WorldQueryKind::Galaxy {
                galaxy: 1,
                system: 100,
            },
        },
    )
    .await
    .unwrap();
    assert!(
        game.world_query(
            principal,
            WorldQuery {
                context: QueryContext {
                    binding,
                    request_id: Uuid::new_v4()
                },
                query: WorldQueryKind::Galaxy {
                    galaxy: 1,
                    system: 101
                }
            }
        )
        .await
        .is_err()
    );
}

#[tokio::test]
async fn small_universe_capacity_is_derived_and_bad_setup_creates_no_world() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let options = UniverseOptions {
        galaxies: Some(1),
        systems_per_galaxy: Some(1),
        positions_per_system: Some(15),
    };
    assert!(
        store
            .ensure_signup_universe(Some(u), options, Some(10))
            .await
            .is_err()
    );
    assert!(
        !sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM universes WHERE id=$1)")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    assert!(
        store
            .ensure_signup_universe(
                Some(u),
                UniverseOptions {
                    positions_per_system: Some(5),
                    ..options
                },
                None
            )
            .await
            .is_err()
    );
    let policy = store
        .ensure_signup_universe(Some(u), options, None)
        .await
        .unwrap();
    assert_eq!(policy.max_players, 9);
    let password_hash = hash_password("p").unwrap();
    for _ in 0..9 {
        store
            .register(registration(policy, &password_hash))
            .await
            .unwrap();
    }
    assert!(matches!(
        store.register(registration(policy, &password_hash)).await,
        Err(StoreError::UniverseFull)
    ));
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(DISTINCT position) FROM bodies WHERE universe=$1 AND galaxy=1 AND system=1 AND position BETWEEN 4 AND 12").bind(u.0).fetch_one(&pool).await.unwrap(), 9);
}

#[tokio::test]
async fn retained_legacy_world_keeps_its_rules_and_placement() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|_| MvpAccount {
        name: format!("legacy-{}", Uuid::new_v4()),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_raids(u, 1000, &accounts, &[19; 32])
        .await
        .unwrap();
    let policy = store
        .ensure_signup_universe(Some(u), Default::default(), None)
        .await
        .unwrap();
    assert_eq!(policy.max_players, 45);
    assert!(
        store
            .ensure_signup_universe(
                Some(u),
                UniverseOptions {
                    systems_per_galaxy: Some(100),
                    ..Default::default()
                },
                None
            )
            .await
            .is_err()
    );
    store.set_test_time(1000).await.unwrap();
    let result = store
        .register(registration(policy, &hash_password("p").unwrap()))
        .await
        .unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let coordinates: (i32, i32) = sqlx::query_as("SELECT galaxy,system FROM bodies WHERE owner=$1")
        .bind(result.memberships[0].player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(coordinates, (1, 1));
    drop(store.server_guard_config(None).await.unwrap());
}
