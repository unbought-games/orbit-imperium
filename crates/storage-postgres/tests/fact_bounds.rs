use orbit_application::*;
use orbit_engine::Building;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn historical_operations_do_not_expand_unrelated_transition_facts() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &passwords).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let service = GameService::new(store.clone());
    let view = service.view(actor, u).await.unwrap();
    let body = view.bodies[0].id;
    let request = QuoteRequest::Upgrade {
        body,
        building: Building::MetalMine,
    };
    let before = store.load_quote(actor, u, &request).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::query("INSERT INTO constructions(id,universe,body,owner,status,generation,revision,building,target_level,paid,profile_hash,terms_hash,started_at,due_at) SELECT gen_random_uuid(),b.universe,b.id,b.owner,'Completed',0,1,'MetalMine',2,'{\"metal\":0,\"crystal\":0,\"deuterium\":0}'::jsonb,u.profile_hash,u.profile_hash,0,1 FROM bodies b JOIN universes u ON u.id=b.universe CROSS JOIN generate_series(1,500) WHERE b.id=$1").bind(body.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO fleets(id,universe,owner,origin,target,target_owner,target_kind,payload,paid_fuel,profile_hash,terms_hash,launched_at,duration,due_at,generation,status,revision) SELECT gen_random_uuid(),b.universe,b.owner,b.id,b.id,b.owner,'Planet','{\"metal\":0,\"crystal\":0,\"deuterium\":0}'::jsonb,3000000,u.profile_hash,u.profile_hash,0,1,2,1,'Completed',2 FROM bodies b JOIN universes u ON u.id=b.universe CROSS JOIN generate_series(1,500) WHERE b.id=$1").bind(body.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO fleet_ships(fleet,owner,ship_type,count) SELECT id,owner,'SmallCargo',2 FROM fleets").execute(&pool).await.unwrap();
    let after = store.load_quote(actor, u, &request).await.unwrap();
    assert_eq!(
        orbit_engine::hash(&after.state),
        orbit_engine::hash(&before.state)
    );
    let operation: Uuid = sqlx::query_scalar("SELECT id FROM constructions LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    let command = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: view.epoch,
        protocol: 2,
        command: Command::CancelConstruction {
            operation: operation.into(),
        },
    };
    service.submit(actor, u, command).await.unwrap();
    let claim = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    assert_eq!(facts.constructions.len(), 1);
    assert!(facts.fleets.is_empty());
    service.resolve_claim(claim).await.unwrap();
    let fleet: Uuid = sqlx::query_scalar("SELECT id FROM fleets LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    service
        .submit(
            actor,
            u,
            CommandEnvelope {
                command_id: Uuid::new_v4().into(),
                epoch: view.epoch,
                protocol: 2,
                command: Command::RecallFleet {
                    fleet: fleet.into(),
                },
            },
        )
        .await
        .unwrap();
    let claim = store
        .claim_next(u, Uuid::new_v4().into())
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    assert_eq!(facts.fleets.len(), 1);
    assert!(facts.constructions.is_empty());
    assert_eq!(facts.fleets[&fleet.into()].ships.len(), 1);
}
