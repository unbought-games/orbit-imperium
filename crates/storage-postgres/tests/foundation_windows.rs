use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn report_windows_and_independent_body_admission_are_exact() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1000, 1, &pw).await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let session = SessionService::new(store.clone())
        .login("alpha", &pw[0], None)
        .await
        .unwrap()
        .session;
    let game = GameService::new(store.clone());
    let b = game
        .current_binding(session.account, u, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let p = Principal {
        account: b.account,
        player: b.player,
        universe: u,
    };
    let context = || QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    };
    let first = game.bound_view(p, context()).await.unwrap().view.bodies[0].id;
    let second = BodyId(Uuid::new_v4());
    sqlx::query("INSERT INTO bodies SELECT $2,universe,owner,kind,galaxy,system,10,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies WHERE id=$1").bind(first.0).bind(second.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO legacy_body_capacities SELECT $2,capacity FROM legacy_body_capacities WHERE body=$1")
        .bind(first.0).bind(second.0).execute(&pool).await.unwrap();
    sqlx::query(
        "INSERT INTO building_levels SELECT $2,building,level FROM building_levels WHERE body=$1",
    )
    .bind(first.0)
    .bind(second.0)
    .execute(&pool)
    .await
    .unwrap();
    for kind in [
        "constructions".to_owned(),
        format!("inventory:{}", b.player),
    ] {
        sqlx::query("INSERT INTO collection_heads(universe,kind,key) VALUES($1,$2,$3)")
            .bind(u.0)
            .bind(kind)
            .bind(second.0)
            .execute(&pool)
            .await
            .unwrap();
    }
    let mut envelopes = Vec::new();
    for body in [first, second] {
        let q = game
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
        envelopes.push(CommandEnvelopeV2 {
            protocol: 2,
            binding: b,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto::StartUpgrade {
                body,
                building: Building::MetalMine,
                expected_terms_hash: q.facts.terms.terms_hash,
            },
        });
    }
    let (a, c) = tokio::join!(
        game.bound_submit(p, envelopes[0].clone()),
        game.bound_submit(p, envelopes[1].clone())
    );
    a.unwrap();
    c.unwrap();
    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    game.step(u, WorkerId(Uuid::new_v4())).await.unwrap();
    let view = game.bound_view(p, context()).await.unwrap();
    assert_eq!(view.view.constructions.len(), 2);
    assert!(
        view.view
            .bodies
            .iter()
            .all(|body| body.amounts.metal == "910000000")
    );
    // Insertion into a previously empty covered inventory invalidates the original fact hash/head.
    let cancellation = CommandEnvelope {
        protocol: 2,
        epoch: b.epoch,
        command_id: CommandId(Uuid::new_v4()),
        command: Command::CancelConstruction {
            operation: OperationId(
                Uuid::parse_str(
                    &view
                        .view
                        .constructions
                        .iter()
                        .find(|c| c.body == second)
                        .unwrap()
                        .id,
                )
                .unwrap(),
            ),
        },
    };
    store
        .admit(Actor::Player(b.player), u, cancellation)
        .await
        .unwrap();
    let claim = store
        .claim_next(u, WorkerId(Uuid::new_v4()))
        .await
        .unwrap()
        .unwrap();
    let facts = store.load_claim(&claim).await.unwrap().state;
    assert!(
        mobile_inventory(
            &facts,
            second,
            b.player,
            &store.load_rules(u).await.unwrap()
        )
        .unwrap()
        .is_empty()
    );
    let outcome = transition(&facts, &claim.input, &store.load_rules(u).await.unwrap());
    sqlx::query("INSERT INTO inventories(body,owner,item,count) VALUES($1,$2,'{\"kind\":\"Ship\",\"id\":\"SmallCargo\"}',2)").bind(second.0).bind(b.player.0).execute(&pool).await.unwrap();
    sqlx::query(
        "UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind=$2 AND key=$3",
    )
    .bind(u.0)
    .bind(format!("inventory:{}", b.player))
    .bind(second.0)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::Conflict
    );
    game.resolve_claim(claim).await.unwrap();
    // Immutable historical report fixture: one completed fleet, 101 authorized reports.
    let fleet = Uuid::new_v4();
    sqlx::query("INSERT INTO fleets(id,universe,owner,origin,target,target_owner,target_kind,payload,paid_fuel,profile_hash,terms_hash,launched_at,duration,due_at,generation,status,revision) SELECT $2,universe,owner,id,id,owner,'Planet','{\"metal\":0,\"crystal\":0,\"deuterium\":0}',0,$3,$3,0,1,1,1,'Completed',1 FROM bodies WHERE id=$1").bind(first.0).bind(fleet).bind(&view.view.profile_hash.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO reports SELECT gen_random_uuid(),$1,$2,'Returned',n,$3,$3,'{\"metal\":0,\"crystal\":0,\"deuterium\":0}' FROM generate_series(1,101) n").bind(u.0).bind(fleet).bind(first.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO report_recipients SELECT id,$1 FROM reports")
        .bind(b.player.0)
        .execute(&pool)
        .await
        .unwrap();
    let window = game.bound_view(p, context()).await.unwrap();
    assert_eq!(window.view.reports.len(), 100);
    assert!(window.view.reports_truncated);
    assert_eq!(window.view.reports[0].at, 101);
    assert_eq!(window.view.reports[99].at, 2);
    sqlx::query("DELETE FROM reports WHERE at_ms=1")
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        !game
            .bound_view(p, context())
            .await
            .unwrap()
            .view
            .reports_truncated
    );
    sqlx::query("INSERT INTO bodies SELECT gen_random_uuid(),universe,owner,kind,galaxy,2,n,fields,max_temperature,amounts,carry,checkpoint_at,revision FROM bodies CROSS JOIN generate_series(1,101) n WHERE id=$1").bind(first.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO legacy_body_capacities SELECT b.id,l.capacity FROM bodies b CROSS JOIN legacy_body_capacities l WHERE b.system=2 AND l.body=$1").bind(first.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO building_levels SELECT b.id,l.building,l.level FROM bodies b CROSS JOIN building_levels l WHERE b.system=2 AND l.body=$1").bind(first.0).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO collection_heads(universe,kind,key) SELECT universe,'constructions',id FROM bodies WHERE system=2 UNION ALL SELECT universe,'inventory:' || owner::text,id FROM bodies WHERE system=2").execute(&pool).await.unwrap();
    let window = game.bound_view(p, context()).await.unwrap();
    assert_eq!(window.view.destinations.len(), 100);
    assert!(window.view.destinations_truncated);
    assert_eq!(window.view.bodies.len(), 103);
}
