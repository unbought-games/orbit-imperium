use super::*;

#[tokio::test]
async fn galaxy_one_exhaustion_is_atomic_for_bots_and_signups_with_other_galaxies_empty() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    let u = orbit_engine::UniverseId(Uuid::new_v4());
    store
        .create_universe(&UniverseCreate {
            universe: u,
            immutable: UniverseImmutable {
                galaxies: 2,
                systems_per_galaxy: 1,
                ..Default::default()
            },
            policy: UniversePolicy {
                bots: BotPolicy {
                    enabled: true,
                    max_active: 20,
                    action_units_per_24h: Some(100),
                    ..Default::default()
                },
                ..Default::default()
            },
        })
        .await
        .unwrap();
    for n in 0..9 {
        store
            .create_bot(u, &format!("g1-{u}-{n}"), 0)
            .await
            .unwrap();
    }
    let name = format!("full-{u}");
    assert!(matches!(
        store.create_bot(u, &name, 0).await,
        Err(StoreError::UniverseFull)
    ));
    assert!(store.find_credentials(&name).await.unwrap().is_none());
    assert!(matches!(
        store
            .register(Registration {
                name: name.clone(),
                password_hash: "test-hash".into(),
                policy: SignupPolicy {
                    universe: u,
                    max_players: 18
                },
                digest: Uuid::new_v4().to_string(),
                csrf: Uuid::new_v4().to_string(),
                previous: None,
            })
            .await,
        Err(StoreError::UniverseFull)
    ));
    assert!(store.find_credentials(&name).await.unwrap().is_none());
    let locations: Vec<(i32, i32, i32)> = sqlx::query_as(
        "SELECT galaxy,system,position FROM bodies WHERE universe=$1 ORDER BY position",
    )
    .bind(u.0)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(locations, (4..=12).map(|p| (1, 1, p)).collect::<Vec<_>>());
    let members: i64 =
        sqlx::query_scalar("SELECT count(*) FROM universe_memberships WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(members, 9);
}
