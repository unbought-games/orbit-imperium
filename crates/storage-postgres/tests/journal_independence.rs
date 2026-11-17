//! Retry authority must survive journal removal in both execution modes.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
enum Work {
    Serial(Claim),
    Scoped(ScopedClaim),
}
impl Work {
    fn input(&self) -> &OrderedInput {
        match self {
            Self::Serial(c) => &c.input,
            Self::Scoped(c) => &c.input,
        }
    }
    fn input_mut(&mut self) -> &mut OrderedInput {
        match self {
            Self::Serial(c) => &mut c.input,
            Self::Scoped(c) => &mut c.input,
        }
    }
    async fn load(&self, s: &PgStore) -> ClaimSnapshot {
        match self {
            Self::Serial(c) => s.load_claim(c).await.unwrap(),
            Self::Scoped(c) => s.load_scoped(c).await.unwrap(),
        }
    }
    async fn commit(
        &self,
        s: &PgStore,
        result: TransitionResult,
    ) -> Result<CommitOutcome, StoreError> {
        match self {
            Self::Serial(c) => s.commit_claim(c, result).await,
            Self::Scoped(c) => s.commit_scoped(c, result).await,
        }
    }
}
async fn claim(s: &PgStore, u: UniverseId, scoped: bool) -> Work {
    if scoped {
        Work::Scoped(
            s.claim_scoped(u, Uuid::new_v4().into())
                .await
                .unwrap()
                .unwrap(),
        )
    } else {
        Work::Serial(
            s.claim_next(u, Uuid::new_v4().into())
                .await
                .unwrap()
                .unwrap(),
        )
    }
}
async fn effects(pool: &PgPool) -> serde_json::Value {
    sqlx::query_scalar("SELECT jsonb_build_object('bodies',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM bodies b),'construction',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM constructions c),'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY input_id) FROM commands c),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM scheduled_events e),'updates',(SELECT jsonb_agg(to_jsonb(g) ORDER BY to_jsonb(g)::text) FROM game_updates g))").fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn immutable_terminal_rows_protect_retries_with_and_without_journal() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let pool = PgPool::connect(&url).await.unwrap();
    for scoped in [false, true] {
        for absent in [false, true] {
            sqlx::raw_sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
                .execute(&pool)
                .await
                .unwrap();
            let s = PgStore::connect(&url).await.unwrap();
            s.migrate().await.unwrap();
            let ledger: Vec<(i64, Vec<u8>)> =
                sqlx::query_as("SELECT version,checksum FROM _sqlx_migrations ORDER BY version")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            let u = UniverseId(Uuid::new_v4());
            let passwords = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
            s.seed(u, 1_000_000, 1, &passwords).await.unwrap();
            s.set_test_time(1_000_000).await.unwrap();
            if !absent {
                // Preserve the no-write compatibility regression after fresh installs
                // apply removal. The supported prefix upgrade is tested separately
                // in migrations.rs; this is only a historical-table test fixture.
                let create = include_str!("../migrations/0001_fresh.sql")
                    .lines()
                    .find(|line| line.starts_with("CREATE TABLE transition_journal "))
                    .unwrap();
                sqlx::raw_sql(create).execute(&pool).await.unwrap();
            }
            if scoped {
                s.prepare_scoped_runtime(u, 100).await.unwrap();
                s.activate_scoped_runtime(u).await.unwrap();
            }
            let login = SessionService::new(s.clone())
                .login("alpha", &passwords[0], None)
                .await
                .unwrap();
            let actor = Actor::Player(login.session.memberships[0].player);
            let other_universe = UniverseId(Uuid::new_v4());
            s.create_universe(&UniverseCreate {
                universe: other_universe,
                immutable: UniverseImmutable::default(),
                policy: UniversePolicy::default(),
            })
            .await
            .unwrap();
            let game = GameService::new(s.clone());
            let view = game.view(actor, u).await.unwrap();
            let body = view.bodies[0].id;
            let q = game
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
            let envelope = CommandEnvelope {
                command_id: Uuid::new_v4().into(),
                epoch: view.epoch,
                protocol: 2,
                command: Command::StartUpgrade {
                    body,
                    building: Building::MetalMine,
                    expected_terms_hash: q.terms_hash,
                },
            };
            game.submit(actor, u, envelope.clone()).await.unwrap();
            let c = claim(&s, u, scoped).await;
            let f = c.load(&s).await;
            let result = transition(&f.state, c.input(), &f.rules);
            assert!(matches!(result, TransitionResult::Applied(_)));
            // A forged input may not acquire authority from a valid claim token.
            let mut changed = c.clone();
            changed.input_mut().at += 1;
            assert!(matches!(
                changed.commit(&s, result.clone()).await,
                Err(StoreError::Conflict)
            ));
            let (a, b) = tokio::join!(c.commit(&s, result.clone()), c.commit(&s, result.clone()));
            let receipt = match a.unwrap() {
                CommitOutcome::Committed {
                    receipt: Some(r), ..
                } => r,
                other => panic!("{other:?}"),
            };
            assert!(
                matches!(b.unwrap(),CommitOutcome::Committed {receipt:Some(ref r),..} if *r==receipt)
            );
            let before = effects(&pool).await;
            // Reconnect after the commit, as a worker with an uncertain acknowledgement.
            let reopened = PgStore::connect(&url).await.unwrap();
            reopened.migrate().await.unwrap();
            reopened.ready().await.unwrap();
            assert!(
                matches!(c.commit(&reopened,result.clone()).await.unwrap(),CommitOutcome::Committed {receipt:Some(ref r),..} if *r==receipt)
            );
            assert_eq!(
                game.submit(actor, u, envelope.clone()).await.unwrap(),
                receipt
            );
            let mut changed_request = envelope.clone();
            changed_request.command = Command::CancelConstruction {
                operation: Uuid::new_v4().into(),
            };
            assert!(matches!(
                game.submit(actor, u, changed_request).await,
                Err(ServiceError::Conflict)
            ));
            for field in 0..5 {
                let mut bad = c.clone();
                match field {
                    0 => bad.input_mut().actor = Actor::Scheduler,
                    1 => bad.input_mut().epoch = Uuid::new_v4().into(),
                    2 => {
                        bad.input_mut().payload = Input::Command(Command::CancelConstruction {
                            operation: Uuid::new_v4().into(),
                        })
                    }
                    3 => bad.input_mut().profile_hash = Hash("changed".into()),
                    _ => bad.input_mut().universe = other_universe,
                }
                assert!(matches!(
                    bad.commit(&reopened, result.clone()).await,
                    Err(StoreError::Conflict)
                ));
            }
            assert_eq!(effects(&pool).await, before);
            // Rejection is terminal and retains the exact original receipt.
            let rejected = CommandEnvelope {
                command_id: Uuid::new_v4().into(),
                command: Command::CancelConstruction {
                    operation: Uuid::new_v4().into(),
                },
                ..envelope.clone()
            };
            game.submit(actor, u, rejected).await.unwrap();
            let reject = claim(&s, u, scoped).await;
            let f = reject.load(&s).await;
            let result = transition(&f.state, reject.input(), &f.rules);
            assert!(matches!(result, TransitionResult::Rejected(_)));
            let first = reject.commit(&s, result.clone()).await.unwrap();
            let before = effects(&pool).await;
            assert_eq!(first, reject.commit(&reopened, result).await.unwrap());
            assert_eq!(effects(&pool).await, before);
            // Accepted scheduled work stays valid long after admission. A stale worker
            // cannot execute after another worker has reclaimed its expired lease.
            let due: i64 = sqlx::query_scalar("SELECT due_at FROM constructions")
                .fetch_one(&pool)
                .await
                .unwrap();
            s.set_test_time(due).await.unwrap();
            let stale = claim(&s, u, scoped).await;
            let f = stale.load(&s).await;
            let result = transition(&f.state, stale.input(), &f.rules);
            s.set_test_time(due + 16_000).await.unwrap();
            let fresh = claim(&s, u, scoped).await;
            assert!(matches!(
                stale.commit(&s, result.clone()).await.unwrap(),
                CommitOutcome::StaleClaim
            ));
            sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer); INSERT INTO orbit_test_fault VALUES('after_commit','error',true,0)").execute(&pool).await.unwrap();
            assert!(fresh.commit(&s, result.clone()).await.is_err());
            let before = effects(&pool).await;
            assert!(matches!(
                fresh.commit(&reopened, result.clone()).await.unwrap(),
                CommitOutcome::Committed { receipt: None, .. }
            ));
            assert_eq!(effects(&pool).await, before);
            assert_eq!(
                sqlx::query_scalar::<_, String>("SELECT status FROM constructions")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                "Completed"
            );
            assert_eq!(
                sqlx::query_scalar::<_, i64>(
                    "SELECT level FROM building_levels WHERE body=$1 AND building='MetalMine'"
                )
                .bind(body.0)
                .fetch_one(&pool)
                .await
                .unwrap(),
                2
            );
            // Cancellation is not successful execution, even with a once-valid claim.
            let event = Uuid::new_v4();
            let mut cancelled = fresh.clone();
            cancelled.input_mut().id = event.into();
            sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event,cancelled) SELECT $1,universe,at_ms,sequence,$2,event,true FROM scheduled_events WHERE id=$3")
            .bind(event).bind(sqlx::types::Json(cancelled.input())).bind(fresh.input().id.0).execute(&pool).await.unwrap();
            assert!(matches!(
                cancelled.commit(&s, result).await.unwrap(),
                CommitOutcome::StaleClaim
            ));
            assert!(
                !sqlx::query_scalar::<_, bool>("SELECT done FROM scheduled_events WHERE id=$1")
                    .bind(event)
                    .fetch_one(&pool)
                    .await
                    .unwrap()
            );
            let after: Vec<(i64, Vec<u8>)> =
                sqlx::query_as("SELECT version,checksum FROM _sqlx_migrations ORDER BY version")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(ledger, after);
            assert_eq!(
                sqlx::query_scalar::<_, bool>("SELECT to_regclass('transition_journal') IS NULL")
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                absent
            );
            if !absent {
                assert_eq!(
                    sqlx::query_scalar::<_, i64>("SELECT count(*) FROM transition_journal")
                        .fetch_one(&pool)
                        .await
                        .unwrap(),
                    0
                );
                // Rehearse the exact removal SQL over real retained receipts and
                // accepted future work. Migration-ledger/prefix handling is covered
                // in migrations.rs, independently of this gameplay fixture.
                sqlx::query("UPDATE orbit_test_fault SET enabled=false")
                    .execute(&pool)
                    .await
                    .unwrap();
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
                let next = CommandEnvelope {
                    command_id: Uuid::new_v4().into(),
                    command: Command::StartUpgrade {
                        body,
                        building: Building::MetalMine,
                        expected_terms_hash: quote.terms_hash,
                    },
                    ..envelope.clone()
                };
                game.submit(actor, u, next.clone()).await.unwrap();
                let pending = claim(&s, u, scoped).await;
                let f = pending.load(&s).await;
                let outcome = transition(&f.state, pending.input(), &f.rules);
                assert!(matches!(outcome, TransitionResult::Applied(_)));
                pending.commit(&s, outcome).await.unwrap();
                let retained = effects(&pool).await;
                sqlx::raw_sql(include_str!(
                    "../migrations/0051_drop_transition_journal.sql"
                ))
                .execute(&pool)
                .await
                .unwrap();
                assert_eq!(
                    effects(&pool).await,
                    retained,
                    "removal must preserve all retained state and future work"
                );
                reopened.migrate().await.unwrap();
                assert!(matches!(
                    game.submit(actor, u, next).await.unwrap().status,
                    ReceiptStatus::Committed { .. }
                ));
                assert_eq!(
                    game.submit(actor, u, envelope.clone()).await.unwrap(),
                    receipt
                );
                let due: i64 =
                    sqlx::query_scalar("SELECT due_at FROM constructions WHERE status='Active'")
                        .fetch_one(&pool)
                        .await
                        .unwrap();
                s.set_test_time(due).await.unwrap();
                let pending = claim(&s, u, scoped).await;
                let f = pending.load(&s).await;
                pending
                    .commit(&s, transition(&f.state, pending.input(), &f.rules))
                    .await
                    .unwrap();
                assert_eq!(
                    sqlx::query_scalar::<_, i64>(
                        "SELECT level FROM building_levels WHERE body=$1 AND building='MetalMine'"
                    )
                    .bind(body.0)
                    .fetch_one(&pool)
                    .await
                    .unwrap(),
                    3
                );
            }
        }
    }
}
