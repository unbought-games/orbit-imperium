use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::{MvpAccount, PgStore};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use uuid::Uuid;

#[derive(Default)]
struct Recorder(Mutex<Vec<(RequestAction, bool, AdmissionOutcome)>>);
impl RuntimeObserver for Recorder {
    fn duration(&self, _: RuntimeStage, _: Duration) {}
    fn event(&self, _: RuntimeEvent) {}
    fn admission(
        &self,
        action: RequestAction,
        machine: bool,
        outcome: AdmissionOutcome,
        _: Duration,
    ) {
        self.0.lock().unwrap().push((action, machine, outcome));
    }
}
#[tokio::test]
async fn admission_metrics_follow_durable_commit_not_response_success_or_retry() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let recorder = Arc::new(Recorder::default());
    let store = PgStore::connect(&url)
        .await
        .unwrap()
        .with_observer(recorder.clone());
    store.migrate().await.unwrap();
    let universe = UniverseId(Uuid::new_v4());
    let accounts: [MvpAccount; 5] = std::array::from_fn(|i| MvpAccount {
        name: format!("metrics-fixture-{i}"),
        password: Uuid::new_v4().to_string(),
    });
    store
        .bootstrap_mvp_fleets(universe, 1000, &accounts, &[31; 32])
        .await
        .unwrap();
    let auth = SessionService::new(store.clone())
        .login(&accounts[0].name, &accounts[0].password, None)
        .await
        .unwrap();
    let game = GameService::new(store.clone());
    let binding = game
        .current_binding(auth.session.account, universe, Uuid::new_v4())
        .await
        .unwrap()
        .binding;
    let actor = Principal {
        account: binding.account,
        player: binding.player,
        universe,
    };
    let view = game
        .world_view(
            actor,
            QueryContext {
                binding,
                request_id: Uuid::new_v4(),
            },
        )
        .await
        .unwrap();
    let body = view.progression.bodies[0].id;
    let new_pair = || {
        let gameplay = CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::StartManufacture {
                body,
                item: ManufacturedItem::Ship(ShipType::EspionageProbe),
                quantity: 1,
                expected_terms_hash: Hash("0".repeat(64)),
            }),
        };
        let presence = CommandEnvelopeV4 {
            protocol: 4,
            binding,
            command_id: CommandId(Uuid::new_v4()),
            command: CommandDto3::Progression(Command::World {
                action: WorldAction::RecordForegroundPresence {
                    body: Some(body),
                    cause: PresenceCause::GameplayGesture,
                    paired_command_id: Some(gameplay.command_id),
                },
            }),
        };
        ForegroundAction { presence, gameplay }
    };
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    sqlx::raw_sql("CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text NOT NULL,enabled boolean NOT NULL,seen bigint NOT NULL DEFAULT 0); INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('before_pair_admission','error',true)").execute(&pool).await.unwrap();
    let mut listener = sqlx::postgres::PgListener::connect_with(&pool)
        .await
        .unwrap();
    listener.listen("orbit_work_ready").await.unwrap();
    let failed = new_pair();
    assert!(game.world_submit(actor, failed.clone()).await.is_err());
    assert!(matches!(
        game.bound_receipt(actor, binding, failed.gameplay.command_id)
            .await,
        Err(ServiceError::NotFound)
    ));
    assert_eq!(
        *recorder.0.lock().unwrap(),
        vec![(RequestAction::ShipOrder, false, AdmissionOutcome::Error)]
    );
    // A later sentinel provides a finite, ordered boundary for the LISTEN
    // assertions even when an implementation forgets to publish a wakeup.
    sqlx::query("SELECT pg_notify('orbit_work_ready','after-rollback')")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(listener.recv().await.unwrap().payload(), "after-rollback");
    // A response failure after the commit must remain a committed admission.
    sqlx::query("INSERT INTO orbit_test_fault(stage,mode,enabled) VALUES('after_pair_admission','error',true)").execute(&pool).await.unwrap();
    assert!(game.world_submit(actor, failed.clone()).await.is_err());
    assert!(
        game.bound_receipt(actor, binding, failed.gameplay.command_id)
            .await
            .is_ok()
    );
    sqlx::query("SELECT pg_notify('orbit_work_ready','after-commit')")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(listener.recv().await.unwrap().payload(), "");
    assert_eq!(listener.recv().await.unwrap().payload(), "after-commit");
    drop(listener);
    game.world_submit(actor, failed).await.unwrap();
    assert_eq!(
        *recorder.0.lock().unwrap(),
        vec![
            (RequestAction::ShipOrder, false, AdmissionOutcome::Error),
            (RequestAction::ShipOrder, false, AdmissionOutcome::Committed),
            (RequestAction::ShipOrder, false, AdmissionOutcome::Replay),
        ]
    );
    sqlx::query("DROP TABLE orbit_test_fault")
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;
}
