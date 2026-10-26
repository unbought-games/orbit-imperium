use super::*;

pub(super) async fn drain(store: &PgStore, universe: UniverseId) {
    let game = GameService::new(store.clone());
    let scoped = store.runtime_mode(universe).await.unwrap().mode == ExecutorMode::Scoped;
    for _ in 0..100 {
        let outcome = if scoped {
            game.step_scoped(universe, WorkerId(Uuid::new_v4()), &InlineEngine)
                .await
                .unwrap()
        } else {
            game.step(universe, WorkerId(Uuid::new_v4())).await.unwrap()
        };
        if matches!(outcome, StepOutcome::Idle) {
            return;
        }
    }
    panic!("gameplay fixture did not drain");
}
pub(super) async fn command(store: &PgStore, binding: Binding, command: Command) {
    let body = match &command {
        Command::StartUpgrade { body, .. }
        | Command::SetProduction { body, .. }
        | Command::StartManufacture { body, .. } => *body,
        Command::StartResearch { host, .. } => *host,
        _ => panic!("fixture command body"),
    };
    let id = CommandId(Uuid::new_v4());
    store
        .bound_admit4(ForegroundAction {
            gameplay: CommandEnvelopeV4 {
                protocol: 4,
                binding,
                command_id: id,
                command: CommandDto3::Progression(command),
            },
            presence: CommandEnvelopeV4 {
                protocol: 4,
                binding,
                command_id: CommandId(Uuid::new_v4()),
                command: CommandDto3::Progression(Command::World {
                    action: WorldAction::RecordForegroundPresence {
                        body: Some(body),
                        cause: PresenceCause::GameplayGesture,
                        paired_command_id: Some(id),
                    },
                }),
            },
        })
        .await
        .unwrap();
    drain(store, binding.universe).await;
    let principal = Principal {
        account: binding.account,
        player: binding.player,
        universe: binding.universe,
    };
    let receipt = GameService::new(store.clone())
        .bound_receipt(principal, binding, id)
        .await
        .unwrap();
    assert!(
        matches!(receipt.status, ReceiptStatus::Committed { .. }),
        "{receipt:?}"
    );
}
pub(super) async fn complete(store: &PgStore, binding: Binding, request: QuoteRequest) {
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let quote = inspect_progression(
        &snapshot.state,
        Actor::Player(binding.player),
        &request,
        snapshot.at,
        &snapshot.rules,
    )
    .unwrap();
    assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
    let hash = quote.terms_hash.unwrap();
    let c = match request {
        QuoteRequest::Upgrade { body, building } => Command::StartUpgrade {
            body,
            building,
            expected_terms_hash: hash,
        },
        QuoteRequest::Research { host, research } => Command::StartResearch {
            host,
            research,
            expected_terms_hash: hash,
        },
        _ => panic!("unsupported fixture work"),
    };
    command(store, binding, c).await;
    let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
    let due = snapshot
        .state
        .constructions
        .values()
        .filter(|c| c.status == ConstructionStatus::Active)
        .map(|c| c.due_at)
        .chain(
            snapshot
                .state
                .research_operations
                .values()
                .filter(|r| r.status == ResearchStatus::Active)
                .map(|r| r.commitment.due_at),
        )
        .max()
        .unwrap();
    store.set_test_time(due).await.unwrap();
    drain(store, binding.universe).await;
}
