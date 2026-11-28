//! Admission authority is finite. Immutable execution and owned receipt reads outlive it.
use orbit_application::*;
use orbit_engine::{Building, ManufacturedItem, ShipType};
use orbit_storage_postgres::{MvpAccount, PgStore};
use sqlx::PgPool;
use uuid::Uuid;

const START: i64 = 1_000_000;

async fn database() -> (PgStore, PgPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(START).await.unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    (store, pool)
}

fn assert_time_error<T: std::fmt::Debug>(
    result: Result<T, ServiceError>,
    expected: CommandTimeError,
) {
    assert!(
        matches!(result, Err(ServiceError::CommandTime(e)) if e == expected),
        "{result:?}"
    );
}

/// Release a real PostgreSQL lock only after the specified SQL statement is
/// blocked on our backend, advancing wall time in the releasing transaction.
async fn expire_blocked_submission<T: std::fmt::Debug>(
    pool: &PgPool,
    mut holder: sqlx::Transaction<'_, sqlx::Postgres>,
    mut submission: tokio::task::JoinHandle<Result<T, ServiceError>>,
    statement: &str,
) {
    let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *holder)
        .await
        .unwrap();
    loop {
        tokio::select! {
            result = &mut submission => panic!("submission returned before the held lock: {result:?}"),
            waiting = sqlx::query_scalar::<_,bool>(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE starts_with(query,$2) AND $1=ANY(pg_blocking_pids(pid)))"
            ).bind(pid).bind(statement).fetch_one(pool) => {
                if waiting.unwrap() { break; }
            }
        }
    }
    sqlx::query("UPDATE orbit_test_clock SET at_ms=$1")
        .bind(START + COMMAND_WINDOW_MS)
        .execute(&mut *holder)
        .await
        .unwrap();
    holder.commit().await.unwrap();
    assert_time_error(submission.await.unwrap(), CommandTimeError::Expired);
}

#[tokio::test]
async fn submission_expires_while_pending_and_execution_survives_cutover() {
    let (store, pool) = database().await;
    let u = Uuid::new_v4().into();
    let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, START, 1, &passwords).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &passwords[0], None)
        .await
        .unwrap();
    let actor = Actor::Player(login.session.memberships[0].player);
    let game = GameService::new(store.clone());
    let view = game.view(actor, u).await.unwrap();
    let body = view.bodies[0].id;
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
    let order = CommandEnvelope {
        command_id: command_id_at(START).into(),
        epoch: view.epoch,
        protocol: 2,
        command: Command::StartUpgrade {
            body,
            building: Building::MetalMine,
            expected_terms_hash: quote.terms_hash,
        },
    };
    // A frontier ahead of wall time affects ordering only.
    sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
        .bind(u.0)
        .bind(START + COMMAND_WINDOW_MS * 2)
        .execute(&pool)
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        game.submit(actor, u, order.clone()),
        game.submit(actor, u, order.clone())
    );
    let receipt = a.unwrap();
    assert_eq!(b.unwrap(), receipt);
    assert_eq!(receipt.admitted_at, START + COMMAND_WINDOW_MS * 2);
    let cancellation = Command::CancelConstruction {
        operation: Uuid::new_v4().into(),
    };
    let changed = CommandEnvelope {
        command: cancellation.clone(),
        ..order.clone()
    };
    assert!(matches!(
        game.submit(actor, u, changed).await,
        Err(ServiceError::Conflict)
    ));

    let legacy = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        command: cancellation,
        ..order.clone()
    };
    // Model the durable migration deadline with a controlled wall clock.
    sqlx::query("UPDATE command_admission_cutover SET legacy_until_ms=$1")
        .bind(START + 1)
        .execute(&pool)
        .await
        .unwrap();
    game.submit(actor, u, legacy.clone()).await.unwrap();
    store.set_test_time(START + 1).await.unwrap();
    assert_time_error(
        game.submit(actor, u, legacy.clone()).await,
        CommandTimeError::Unsupported,
    );
    assert!(matches!(
        game.receipt(actor, u, legacy.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Pending
    ));

    let missing = command_id_at(START).into();
    store
        .set_test_time(START + COMMAND_WINDOW_MS - 1)
        .await
        .unwrap();
    assert_eq!(game.submit(actor, u, order.clone()).await.unwrap(), receipt);
    assert!(matches!(
        game.receipt(actor, u, missing).await,
        Err(ServiceError::NotFound)
    ));
    // A duplicate already in storage can wait on its receipt read just like a new
    // admission can wait on a write. The post-read wall sample decides the retry.
    let mut holder = pool.begin().await.unwrap();
    sqlx::query("LOCK TABLE commands IN ACCESS EXCLUSIVE MODE")
        .execute(&mut *holder)
        .await
        .unwrap();
    let worker = game.clone();
    let retry = order.clone();
    let duplicate = tokio::spawn(async move { worker.submit(actor, u, retry).await });
    expire_blocked_submission(
        &pool,
        holder,
        duplicate,
        "SELECT intent_hash,receipt FROM commands",
    )
    .await;
    assert_time_error(
        game.submit(actor, u, order.clone()).await,
        CommandTimeError::Expired,
    );
    assert_time_error(
        game.receipt(actor, u, missing).await,
        CommandTimeError::HistoryExpired,
    );
    assert_eq!(
        game.receipt(actor, u, order.command_id).await.unwrap(),
        receipt
    );
    assert!(matches!(
        game.receipt(Actor::Player(Uuid::new_v4().into()), u, missing)
            .await,
        Err(ServiceError::NotFound)
    ));
    let absent = CommandEnvelope {
        command_id: missing,
        ..order.clone()
    };
    assert_time_error(
        game.submit(actor, u, absent).await,
        CommandTimeError::Expired,
    );
    assert_time_error(
        game.receipt(actor, u, Uuid::new_v4().into()).await,
        CommandTimeError::Unsupported,
    );
    // Neither old receipts nor the request window can cancel a long-lived internal timer.
    store.set_test_time(START + 3 * 86_400_000).await.unwrap();
    while matches!(
        game.step(u, Uuid::new_v4().into()).await.unwrap(),
        StepOutcome::Committed { .. }
    ) {}
    let terminal = game.receipt(actor, u, order.command_id).await.unwrap();
    assert!(matches!(terminal.status, ReceiptStatus::Committed { .. }));
    assert!(matches!(
        game.receipt(actor, u, legacy.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected { .. }
    ));
    let completed: i64 =
        sqlx::query_scalar("SELECT count(*) FROM scheduled_events WHERE universe=$1 AND done")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(completed >= 1);
}

#[tokio::test]
async fn whole_pair_lost_ack_old_machine_recovery_and_expiry_while_waiting_for_a_write_lock() {
    let (store, pool) = database().await;
    let u = UniverseId(Uuid::new_v4());
    let accounts = std::array::from_fn(|i| MvpAccount {
        name: format!("command-window-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(u, START, &accounts, &[31; 32])
        .await
        .unwrap();
    let login = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let (binding, _) = store
        .current_binding(login.session.account, u)
        .await
        .unwrap();
    let actor = Principal {
        account: binding.account,
        player: binding.player,
        universe: u,
    };
    let body = game
        .world_view(
            actor,
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap()
        .progression
        .bodies[0]
        .id;
    let order = CommandEnvelopeV4 {
        protocol: 4,
        binding,
        command_id: command_id_at(START).into(),
        command: CommandDto3::Progression(Command::StartManufacture {
            body,
            item: ManufacturedItem::Ship(ShipType::EspionageProbe),
            quantity: 1,
            expected_terms_hash: Hash("0".repeat(64)),
        }),
    };
    let pair = machine_action(order.clone()).unwrap();
    let (a, b) = tokio::join!(
        game.world_submit(actor, pair.clone()),
        game.world_submit(actor, pair.clone())
    );
    assert_eq!(a.unwrap().command_id, b.unwrap().command_id);
    let mut different = pair.clone();
    different.presence.command_id = command_id_at(START).into();
    assert!(matches!(
        game.world_submit(actor, different).await,
        Err(ServiceError::Conflict)
    ));
    // A pre-bridge machine server could already have accepted a v7 gameplay ID.
    // Recreate its actual two durable receipt IDs and shared hash after response loss.
    let mut old = pair.clone();
    old.presence.command_id = Uuid::from_u128(order.command_id.0.as_u128() ^ (1 << 127)).into();
    sqlx::query("UPDATE commands SET intent_hash=$2, command_id=CASE WHEN command_id=$3 THEN $4 ELSE command_id END, receipt=CASE WHEN command_id=$3 THEN jsonb_set(receipt,'{command_id}',to_jsonb($4::uuid)) ELSE receipt END WHERE universe=$1")
        .bind(u.0).bind(orbit_engine::hash(&old).0).bind(pair.presence.command_id.0).bind(old.presence.command_id.0)
        .execute(&pool).await.unwrap();
    assert_eq!(
        game.machine_submit(actor, order.clone())
            .await
            .unwrap()
            .command_id,
        order.command_id
    );
    let changed = CommandEnvelopeV4 {
        command: CommandDto3::Progression(Command::CancelConstruction {
            operation: Uuid::new_v4().into(),
        }),
        ..order.clone()
    };
    assert!(matches!(
        game.machine_submit(actor, changed).await,
        Err(ServiceError::Conflict)
    ));

    let new = CommandEnvelopeV4 {
        command_id: command_id_at(START).into(),
        ..order.clone()
    };
    let racing = machine_action(new.clone()).unwrap();
    // Hold the final pair-link INSERT after the two receipt INSERTs. Advance the
    // test clock only after observing PostgreSQL's actual waiting writer.
    let mut holder = pool.begin().await.unwrap();
    sqlx::query("LOCK TABLE presence_pairs IN SHARE MODE")
        .execute(&mut *holder)
        .await
        .unwrap();
    let worker = GameService::new(store.clone());
    let submission = tokio::spawn(async move { worker.world_submit(actor, racing).await });
    expire_blocked_submission(&pool, holder, submission, "INSERT INTO presence_pairs").await;
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM commands WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 2, "the failed pair must roll back both receipts");
    let pairs: i64 = sqlx::query_scalar("SELECT count(*) FROM presence_pairs WHERE universe=$1")
        .bind(u.0)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(pairs, 1);
    let context = QueryContext {
        binding,
        request_id: Uuid::new_v4(),
    };
    assert_time_error(
        game.social_command(
            actor,
            SocialCommandRequest {
                context: context.clone(),
                command_id: command_id_at(START),
                action: SocialAction::RequestFriend {
                    player: Uuid::new_v4().into(),
                },
            },
        )
        .await,
        CommandTimeError::Expired,
    );
    assert_time_error(
        game.alliance_command(
            actor,
            AllianceCommandRequest {
                context,
                command_id: command_id_at(START),
                expected_revision: None,
                action: AllianceAction::Create {
                    name: "Window Alliance".into(),
                    tag: "WINDOW".into(),
                },
            },
        )
        .await,
        CommandTimeError::Expired,
    );
    let archived_edit = store
        .edit_empire_profile(
            binding.account,
            binding.player.0,
            ProfileCommand {
                command_id: command_id_at(START),
                expected_revision: 0,
                action: ProfileAction::Visibility { public: true },
            },
        )
        .await;
    assert!(matches!(
        archived_edit,
        Err(StoreError::CommandTime(CommandTimeError::Expired))
    ));
    assert_time_error(
        game.bound_receipt(actor, binding, new.command_id).await,
        CommandTimeError::HistoryExpired,
    );
    assert!(matches!(
        game.bound_receipt(
            actor,
            Binding {
                epoch: Uuid::new_v4().into(),
                ..binding
            },
            new.command_id
        )
        .await,
        Err(ServiceError::EpochChanged)
    ));
    assert!(matches!(
        game.bound_receipt(
            actor,
            Binding {
                player: Uuid::new_v4().into(),
                ..binding
            },
            new.command_id
        )
        .await,
        Err(ServiceError::NotFound)
    ));
    assert!(matches!(
        game.bound_receipt(
            actor,
            Binding {
                universe: Uuid::new_v4().into(),
                ..binding
            },
            new.command_id
        )
        .await,
        Err(ServiceError::NotFound)
    ));
    // The pre-bridge high-bit presence identity still belongs to the stored
    // gameplay link. With a pending gameplay half even a retired presence is pinned.
    // Model a pre-inline pair: current admissions complete both halves together.
    sqlx::query("UPDATE commands SET inline_presence=false WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    let worker = Uuid::new_v4().into();
    assert!(matches!(
        game.step(u, worker).await.unwrap(),
        StepOutcome::Committed { .. }
    ));
    sqlx::query("UPDATE command_admission_cutover SET legacy_until_ms=0")
        .execute(&pool)
        .await
        .unwrap();
    store.set_test_time(START + 8 * 86_400_000).await.unwrap();
    sqlx::query("UPDATE commands SET retention_since=to_timestamp(0) WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE game_updates SET created_at=now()-interval '8 days' WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_game_updates().await.unwrap();
    store.prune_terminal_history().await.unwrap();
    let statuses: Vec<bool> =
        sqlx::query_scalar("SELECT done FROM commands WHERE universe=$1 ORDER BY sequence")
            .bind(u.0)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(statuses, vec![true, false]);
    assert!(matches!(
        game.step(u, worker).await.unwrap(),
        StepOutcome::Committed { .. }
    ));
    sqlx::query("UPDATE commands SET retention_since=to_timestamp(0) WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM commands WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&pool)
            .await
            .unwrap(),
        2,
        "one retained outcome pins both halves"
    );
    sqlx::query("UPDATE game_updates SET created_at=now()-interval '8 days' WHERE universe=$1")
        .bind(u.0)
        .execute(&pool)
        .await
        .unwrap();
    store.prune_game_updates().await.unwrap();
    // A reader holding the partner skips the entire group.
    let mut holder = pool.begin().await.unwrap();
    sqlx::query("SELECT input_id FROM commands WHERE command_id=$1 FOR KEY SHARE")
        .bind(old.presence.command_id.0)
        .fetch_one(&mut *holder)
        .await
        .unwrap();
    store.prune_terminal_history().await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT (SELECT count(*) FROM commands WHERE universe=$1)+(SELECT count(*) FROM presence_pairs WHERE universe=$1)")
        .bind(u.0).fetch_one(&pool).await.unwrap(),3);
    holder.commit().await.unwrap();
    // Even interruption after executing both deletes preserves the entire
    // group on rollback. The next ordinary pass removes it.
    let mut aborted = pool.begin().await.unwrap();
    let (groups, _): (i64, i64) = sqlx::query_as(include_str!("../src/retention/commands.sql"))
        .bind(u.0)
        .bind(START + 8 * 86_400_000)
        .bind(0_i64)
        .bind("-infinity")
        .bind(Uuid::nil())
        .bind(START + 8 * 86_400_000)
        .fetch_one(&mut *aborted)
        .await
        .unwrap();
    assert_eq!(groups, 1);
    aborted.rollback().await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT (SELECT count(*) FROM commands WHERE universe=$1)+(SELECT count(*) FROM presence_pairs WHERE universe=$1)")
        .bind(u.0).fetch_one(&pool).await.unwrap(),3);

    store.prune_terminal_history().await.unwrap();
    assert_eq!(sqlx::query_scalar::<_,i64>("SELECT (SELECT count(*) FROM commands WHERE universe=$1)+(SELECT count(*) FROM presence_pairs WHERE universe=$1)")
        .bind(u.0).fetch_one(&pool).await.unwrap(),0);
}
