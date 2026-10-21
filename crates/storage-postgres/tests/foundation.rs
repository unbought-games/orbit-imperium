use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn bound_foundation_identity_inventory_races_and_windows() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1000, 1, &passwords).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let joins: Vec<(bool, Option<i64>)> = sqlx::query_as("SELECT u.development,m.joined_at_ms FROM universe_memberships m JOIN universes u ON u.id=m.universe WHERE u.id=$1")
        .bind(u.0).fetch_all(&pool).await.unwrap();
    assert_eq!(joins, vec![(true, Some(1000)); 2]);
    store.set_test_time(1000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let service = GameService::new(store.clone());
    let candidate = service
        .current_binding(login.session.account, u, Uuid::new_v4())
        .await
        .unwrap();
    let b = candidate.binding;
    let p = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let context = || QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    };
    let view = service.bound_view(p, context()).await.unwrap();
    assert_eq!(view.view.research.len(), 2);
    assert_eq!(view.view.research[0].level, 1);
    assert_eq!(view.view.research[1].level, 0);
    assert_eq!(view.view.bodies[0].inventories[0].count, "2");
    assert!(!view.view.capabilities[2].enabled);
    let body = view.view.bodies[0].id;
    assert!(matches!(
        service
            .bound_quote(
                p,
                context(),
                QuoteRequestDto::Upgrade {
                    body: BodyId(Uuid::new_v4()),
                    building: Building::MetalMine
                }
            )
            .await,
        Err(ServiceError::NotFound)
    ));

    let q = service
        .bound_quote(
            p,
            context(),
            QuoteRequestDto::Upgrade {
                body,
                building: Building::MetalMine,
            },
        )
        .await
        .unwrap();
    assert_eq!(q.terms.cost.metal, "90000000");
    assert_eq!(q.terms.duration, 161000);
    let e = CommandEnvelopeV2 {
        protocol: 2,
        binding: b,
        command_id: CommandId(Uuid::new_v4()),
        command: CommandDto::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: q.terms.terms_hash.clone(),
        },
    };
    let r = service.bound_submit(p, e.clone()).await.unwrap();
    assert!(matches!(r.status, ReceiptStatus::Pending));
    assert_eq!(
        serde_json::to_value(&r).unwrap(),
        serde_json::to_value(service.bound_submit(p, e.clone()).await.unwrap()).unwrap()
    );
    let mut changed = e.clone();
    changed.command = CommandDto::CancelConstruction {
        operation: OperationId(Uuid::new_v4()),
    };
    assert!(matches!(
        service.bound_submit(p, changed).await,
        Err(ServiceError::Conflict)
    ));
    let mut second = e.clone();
    second.command_id = CommandId(Uuid::new_v4());
    service.bound_submit(p, second.clone()).await.unwrap();
    service.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    service.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    assert!(matches!(
        service
            .bound_receipt(p, b, e.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    assert!(matches!(
        service
            .bound_receipt(p, b, second.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected { .. }
    ));
    let after = service.bound_view(p, context()).await.unwrap();
    assert_eq!(after.view.bodies[0].amounts.metal, "910000000");
    assert_eq!(after.view.constructions.len(), 1);
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let stored: String = sqlx::query_scalar("SELECT intent_hash FROM commands WHERE command_id=$1")
        .bind(e.command_id.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(stored, e.intent_hash().unwrap().0);
    // A covered inventory removal and head update invalidates a tentative transition.
    let cancel = CommandEnvelope {
        protocol: 2,
        epoch: b.epoch,
        command_id: CommandId(Uuid::new_v4()),
        command: Command::CancelConstruction {
            operation: OperationId(Uuid::parse_str(&after.view.constructions[0].id).unwrap()),
        },
    };
    store
        .admit(Actor::Player(b.player), u, cancel)
        .await
        .unwrap();
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    let outcome = transition(&facts, &claim.input, &store.load_rules(u).await.unwrap());
    sqlx::query("DELETE FROM inventories WHERE body=$1")
        .bind(body.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind=$2 AND key=$3",
    )
    .bind(u.0)
    .bind(format!("inventory:{}", b.player))
    .bind(body.0)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Conflict
    );
    service.resolve_claim(claim).await.unwrap();
    assert!(
        service.bound_view(p, context()).await.unwrap().view.bodies[0]
            .inventories
            .is_empty()
    );
    // Unknown/missing completed research fails closed instead of defaulting to zero.
    sqlx::query("DELETE FROM research_levels WHERE owner=$1 AND research='ComputerTechnology'")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(service.bound_view(p, context()).await.is_err());
    sqlx::query(
        "INSERT INTO research_levels(owner,research,level) VALUES($1,'ComputerTechnology',0)",
    )
    .bind(b.player.0)
    .execute(&pool)
    .await
    .unwrap();
    // Reset race: change epoch and membership player together, preserving authenticated account.
    let new_epoch = Epoch(Uuid::new_v4());
    let other: Uuid = sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 AND id<>$2")
        .bind(u.0)
        .bind(b.player.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE universes SET epoch=$2 WHERE id=$1")
        .bind(u.0)
        .bind(new_epoch.0)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        service.bound_view(p, context()).await,
        Err(ServiceError::EpochChanged)
    ));
    let mut stale_player = b;
    stale_player.player = PlayerId(other);
    assert!(matches!(
        service
            .bound_view(
                p,
                QueryContext {
                    binding: stale_player,
                    request_id: Uuid::new_v4()
                }
            )
            .await,
        Err(ServiceError::EpochChanged)
    ));
    let new_player = PlayerId(Uuid::new_v4());
    sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
        .bind(new_player.0)
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO research_levels SELECT $2,research,level,revision FROM research_levels WHERE owner=$1").bind(b.player.0).bind(new_player.0).execute(&pool).await.unwrap();
    sqlx::query("UPDATE universe_memberships SET player=$3 WHERE universe=$1 AND account=$2")
        .bind(u.0)
        .bind(b.account.0)
        .bind(new_player.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO viewer_heads(universe,player) VALUES($1,$2)")
        .bind(u.0)
        .bind(new_player.0)
        .execute(&pool)
        .await
        .unwrap();
    for kind in ["research", "fleets"] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(u.0)
            .bind(kind)
            .bind(new_player.0)
            .execute(&pool)
            .await
            .unwrap();
    }
    let next = service
        .current_binding(b.account, u, Uuid::new_v4())
        .await
        .unwrap();
    assert_eq!(next.binding.epoch, new_epoch);
    assert_eq!(next.binding.player, new_player);
    assert!(
        service
            .bound_view(
                p,
                QueryContext {
                    binding: next.binding,
                    request_id: Uuid::new_v4()
                }
            )
            .await
            .is_ok()
    );
    assert!(matches!(
        service.bound_submit(p, e).await,
        Err(ServiceError::EpochChanged)
    ));
    // Known migration checksums are immutable; preparation never repairs corrupt history.
    sqlx::query("UPDATE _sqlx_migrations SET checksum='\\x00' WHERE version=1")
        .execute(&pool)
        .await
        .unwrap();
    assert!(store.migrate().await.is_err());
    let retained: Vec<u8> =
        sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version=1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained, vec![0]);
    assert!(matches!(
        store.server_guard(1).await,
        Err(StoreError::IncompatibleSchema)
    ));
}
