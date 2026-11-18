//! Real locks and database snapshots exercise the production maintenance transactions.
use orbit_application::*;
use orbit_engine::Building;
use orbit_storage_postgres::PgStore;
use sqlx::{Connection, PgConnection, PgPool};
use uuid::Uuid;

const START: i64 = 1_800_000_000_000;
const DAY: i64 = 86_400_000;

async fn setup() -> (PgStore, PgPool, Binding) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(START).await.unwrap();
    sqlx::query("UPDATE command_admission_cutover SET legacy_until_ms=$1")
        .bind(START - DAY)
        .execute(&pool)
        .await
        .unwrap();
    let u = UniverseId(Uuid::new_v4());
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, START, 1, &passwords).await.unwrap();
    sqlx::query("UPDATE accounts SET name=id::text WHERE id IN (SELECT account FROM universe_memberships WHERE universe=$1)").bind(u.0).execute(&pool).await.unwrap();
    let (account,epoch,player): (Uuid,Uuid,Uuid) = sqlx::query_as(
        "SELECT m.account,u.epoch,m.player FROM universes u JOIN universe_memberships m ON m.universe=u.id WHERE u.id=$1 ORDER BY m.player LIMIT 1"
    ).bind(u.0).fetch_one(&pool).await.unwrap();
    (
        store,
        pool,
        Binding {
            universe: u,
            epoch: epoch.into(),
            account: account.into(),
            player: player.into(),
        },
    )
}

async fn count(pool: &PgPool, sql: &str, u: UniverseId) -> i64 {
    sqlx::query_scalar(sql)
        .bind(u.0)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn pending_child_settles_after_parent_and_delivery_retirement() {
    let (store, pool, b) = setup().await;
    let game = GameService::new(store.clone());
    let u = b.universe;
    let actor = Actor::Player(b.player);
    let body = game.view(actor, u).await.unwrap().bodies[0].id;
    let quote = game
        .quote(
            actor,
            u,
            QuoteRequest::Upgrade {
                body,
                building: Building::MetalMine,
            },
        )
        .await
        .unwrap();
    let start = CommandEnvelope {
        command_id: command_id_at(START).into(),
        epoch: b.epoch,
        protocol: 2,
        command: Command::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: quote.terms_hash,
        },
    };
    let cancel = CommandEnvelope {
        command_id: command_id_at(START).into(),
        command: Command::CancelConstruction {
            operation: start.command_id.0.into(),
        },
        ..start.clone()
    };
    game.submit(actor, u, start.clone()).await.unwrap();
    game.submit(actor, u, cancel.clone()).await.unwrap();
    let initial = store.read_updates(b, None, 8).await.unwrap().items[0]
        .cursor
        .clone();
    let worker = Uuid::new_v4().into();
    let claim = store.claim_next(u, worker).await.unwrap().unwrap();
    let facts = store.load_claim(&claim).await.unwrap();
    let outcome = orbit_engine::transition(&facts.state, &claim.input, &facts.rules);
    store.commit_claim(&claim, outcome.clone()).await.unwrap();

    // Set terminal wall stamps independently of the immutable logical ordering time.
    sqlx::query(
        "UPDATE commands SET retention_since=to_timestamp($2::bigint/1000.0) WHERE universe=$1",
    )
    .bind(u.0)
    .bind(START)
    .execute(&pool)
    .await
    .unwrap();
    store.set_test_time(START + 8 * DAY).await.unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(matches!(
        game.receipt(actor, u, start.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    assert!(matches!(
        store.commit_claim(&claim, outcome.clone()).await.unwrap(),
        CommitOutcome::Committed { .. }
    ));
    let stream = store.read_updates(b, initial.as_deref(), 8).await.unwrap();
    assert!(stream.items.iter().any(
        |v| matches!(&v.event,StreamEvent::Outcome{receipt} if receipt.command_id==start.command_id)
    ));

    // A reader whose authorization snapshot preceded cleanup still sees the
    // complete old join. A fresh read after the same two commits sees Reset.
    let mut blocker = pool.begin().await.unwrap();
    sqlx::query("LOCK TABLE game_update_heads IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *blocker)
        .await
        .unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *blocker)
        .await
        .unwrap();
    let reader = store.clone();
    let after = initial.clone();
    let reading = tokio::spawn(async move { reader.read_updates(b, after.as_deref(), 8).await });
    while !sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT position,retired_through%')").bind(pid).fetch_one(&pool).await.unwrap() {
        assert!(!reading.is_finished());
        tokio::task::yield_now().await;
    }
    // Make the deletion and floor visible in the lock holder's transaction.
    sqlx::query(
        "UPDATE game_updates SET created_at=clock_timestamp()-interval '8 days' WHERE universe=$1",
    )
    .bind(u.0)
    .execute(&mut *blocker)
    .await
    .unwrap();
    let (removed, _): (i64, i64) = sqlx::query_as(include_str!("../src/retention/updates.sql"))
        .fetch_one(&mut *blocker)
        .await
        .unwrap();
    assert!(removed > 0);
    blocker.commit().await.unwrap();
    store.prune_terminal_history().await.unwrap();
    let old = reading.await.unwrap().unwrap();
    assert_eq!(
        serde_json::to_value(old).unwrap(),
        serde_json::to_value(stream).unwrap()
    );
    assert!(matches!(
        store
            .read_updates(b, initial.as_deref(), 8)
            .await
            .unwrap()
            .items[0]
            .event,
        StreamEvent::Reset
    ));
    assert!(matches!(
        game.receipt(actor, u, start.command_id).await,
        Err(ServiceError::CommandTime(CommandTimeError::HistoryExpired))
    ));
    assert!(matches!(
        game.submit(actor, u, start).await,
        Err(ServiceError::CommandTime(CommandTimeError::Expired))
    ));
    assert_eq!(
        store.commit_claim(&claim, outcome).await.unwrap(),
        CommitOutcome::StaleClaim
    );
    assert!(matches!(
        game.receipt(actor, u, cancel.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Pending
    ));
    assert_eq!(count(&pool,"SELECT count(*) FROM scheduled_events WHERE universe=$1 AND NOT done AND NOT cancelled",u).await,1);
    game.step(u, worker).await.unwrap();
    assert!(matches!(
        game.receipt(actor, u, cancel.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Committed { .. }
    ));
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM constructions WHERE universe=$1 AND status='Cancelled'",
            u
        )
        .await,
        1
    );

    // Old-worker interior loss with an intact first row must also reset.
    let after = store.read_updates(b, None, 8).await.unwrap().items[0]
        .cursor
        .clone()
        .unwrap();
    sqlx::query("WITH h AS (UPDATE game_update_heads SET position=position+3 WHERE universe=$1 AND epoch=$2 AND player=$3 RETURNING *) INSERT INTO game_updates(universe,epoch,player,position,input_id,kind,minimum_revision) SELECT universe,epoch,player,position-d,gen_random_uuid(),'invalidate',1 FROM h CROSS JOIN unnest(ARRAY[2,0]) d")
        .bind(u.0).bind(b.epoch.0).bind(b.player.0).execute(&pool).await.unwrap();
    assert!(matches!(
        store.read_updates(b, Some(&after), 8).await.unwrap().items[0].event,
        StreamEvent::Reset
    ));
}

#[tokio::test]
async fn cleanup_cannot_replenish_admission_or_forget_unexpired_ids() {
    let (store, pool, b) = setup().await;
    let store = store.with_admission_limit(1).unwrap();
    let game = GameService::new(store.clone());
    let actor = Actor::Player(b.player);
    let command = Command::CancelConstruction {
        operation: Uuid::new_v4().into(),
    };
    let original = CommandEnvelope {
        command_id: command_id_at(START).into(),
        epoch: b.epoch,
        protocol: 2,
        command: command.clone(),
    };
    let later = START + 8 * DAY;
    sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
        .bind(b.universe.0)
        .bind(later)
        .execute(&pool)
        .await
        .unwrap();
    game.submit(actor, b.universe, original.clone())
        .await
        .unwrap();
    store.set_test_time(later).await.unwrap();
    game.step(b.universe, Uuid::new_v4().into()).await.unwrap();
    assert!(matches!(
        game.receipt(actor, b.universe, original.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected { .. }
    ));
    sqlx::query("UPDATE commands SET retention_since=to_timestamp(0) WHERE universe=$1")
        .bind(b.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE game_updates SET created_at=now()-interval '8 days' WHERE universe=$1")
        .bind(b.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_game_updates().await.unwrap();
    store.set_test_time(later + 59_999).await.unwrap();
    store.prune_terminal_history().await.unwrap();
    let new = CommandEnvelope {
        command_id: command_id_at(later + 60_000).into(),
        ..original.clone()
    };
    assert!(matches!(
        game.submit(actor, b.universe, new.clone()).await,
        Err(ServiceError::RateLimited)
    ));
    store.set_test_time(later + 60_000).await.unwrap();
    // The same runtime lock is held by an admitted transaction until its count
    // and resolved child have been stored. Skip it, then retire on the next pass.
    let mut admission = pool.begin().await.unwrap();
    sqlx::query("SELECT universe FROM universe_runtime WHERE universe=$1 FOR SHARE")
        .bind(b.universe.0)
        .fetch_one(&mut *admission)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(
        game.receipt(actor, b.universe, original.command_id)
            .await
            .is_ok()
    );
    admission.commit().await.unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(matches!(
        game.receipt(actor, b.universe, original.command_id).await,
        Err(ServiceError::CommandTime(CommandTimeError::HistoryExpired))
    ));
    game.submit(actor, b.universe, new.clone()).await.unwrap();
    game.step(b.universe, Uuid::new_v4().into()).await.unwrap();
    sqlx::query("UPDATE commands SET retention_since=to_timestamp(0) WHERE universe=$1")
        .bind(b.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE game_updates SET created_at=now()-interval '8 days' WHERE universe=$1")
        .bind(b.universe.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_game_updates().await.unwrap();
    store
        .set_test_time(later + 60_000 + COMMAND_WINDOW_MS - 1)
        .await
        .unwrap();
    let (replay, cleanup) = tokio::join!(
        game.submit(actor, b.universe, new.clone()),
        store.prune_terminal_history()
    );
    cleanup.unwrap();
    assert!(matches!(
        replay.unwrap().status,
        ReceiptStatus::Rejected { .. }
    ));
    store
        .set_test_time(later + 60_000 + COMMAND_WINDOW_MS + 3_600_000 - 1)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(
        game.receipt(actor, b.universe, new.command_id)
            .await
            .is_ok()
    );
    store
        .set_test_time(later + 60_000 + COMMAND_WINDOW_MS + 3_600_000)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert!(matches!(
        game.receipt(actor, b.universe, new.command_id).await,
        Err(ServiceError::CommandTime(CommandTimeError::HistoryExpired))
    ));
}

async fn add_history(pool: &PgPool, b: Binding, n: i32) {
    sqlx::query("INSERT INTO commands(universe,epoch,actor,command_id,input_id,intent_hash,at_ms,sequence,input,receipt,done,retention_since)
       SELECT $1,$2,$3,gen_random_uuid(),gen_random_uuid(),'fixture',0,n,'{}','{}',true,to_timestamp(0) FROM generate_series(1,$4) n")
       .bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).bind(n).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event,done,cancelled,retention_since)
       SELECT gen_random_uuid(),$1,0,n,'{}','{}',n%2=0,n%2=1,to_timestamp(0) FROM generate_series(1,$2) n")
       .bind(b.universe.0).bind(n).execute(pool).await.unwrap();
}

#[tokio::test]
async fn interrupted_batches_converge_under_new_load_and_keep_claims() {
    let (store, pool, b) = setup().await;
    let u = b.universe;
    add_history(&pool, b, 2048).await;
    let pinned: Uuid =
        sqlx::query_scalar("SELECT id FROM scheduled_events WHERE universe=$1 LIMIT 1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("INSERT INTO execution_scopes(universe,key,claim_input,claim_token,claim_owner,lease_until) VALUES($1,'retention-test',$2,gen_random_uuid(),gen_random_uuid(),$3)")
        .bind(u.0).bind(pinned).bind(START+DAY).execute(&pool).await.unwrap();
    let declared: Uuid =
        sqlx::query_scalar("SELECT id FROM scheduled_events WHERE universe=$1 AND id<>$2 LIMIT 1")
            .bind(u.0)
            .bind(pinned)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query(
        "INSERT INTO input_scopes(universe,input_id,scope_key) VALUES($1,$2,'retention-test')",
    )
    .bind(u.0)
    .bind(declared)
    .execute(&pool)
    .await
    .unwrap();

    // Disconnect after the actual deleting statement, before COMMIT. PostgreSQL
    // releases its locks and restores the entire batch, including pair links.
    let mut interrupted = PgConnection::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    sqlx::query("BEGIN")
        .execute(&mut interrupted)
        .await
        .unwrap();
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut interrupted)
        .await
        .unwrap();
    let (n, age): (i64, i64) = sqlx::query_as(include_str!("../src/retention/commands.sql"))
        .bind(u.0)
        .bind(START)
        .bind(START - DAY)
        .fetch_one(&mut interrupted)
        .await
        .unwrap();
    assert_eq!(n, 128);
    assert_eq!(age, START);
    assert!(
        sqlx::query_scalar::<_, bool>("SELECT pg_terminate_backend($1,5000)")
            .bind(pid)
            .fetch_one(&pool)
            .await
            .unwrap()
    );
    drop(interrupted);
    let commands = "SELECT count(*) FROM commands WHERE universe=$1";
    assert_eq!(count(&pool, commands, u).await, 2048);
    let resumed = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let mut backlog = 2048;
    let began = std::time::Instant::now();
    for batch in 1..=19 {
        add_history(&pool, b, 16).await;
        resumed.prune_terminal_history().await.unwrap();
        backlog = (backlog + 16 - 128).max(0);
        assert_eq!(count(&pool, commands, u).await, backlog);
        if batch == 1 {
            assert_eq!(
                count(
                    &pool,
                    "SELECT count(*) FROM scheduled_events WHERE universe=$1",
                    u
                )
                .await,
                1936
            );
        }
    }
    eprintln!(
        "19 maintenance passes, 2048 initial and 16 arriving per pass per table: {:?}",
        began.elapsed()
    );
    assert_eq!(backlog, 0);
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM scheduled_events WHERE universe=$1",
            u
        )
        .await,
        2
    );
    sqlx::query("DELETE FROM execution_scopes WHERE universe=$1 AND key='retention-test'")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM scheduled_events WHERE universe=$1",
            u
        )
        .await,
        0
    );
}
