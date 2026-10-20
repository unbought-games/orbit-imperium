use orbit_application::*;
use orbit_engine::{FleetId, Resources, SCALE, ShipStack, ShipType};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn timely_recall_survives_backlog_and_same_time_recall_is_inline() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &pw).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let login = SessionService::new(store.clone())
        .login("alpha", &pw[0], None)
        .await
        .unwrap();
    let player = login.session.memberships[0].player;
    let actor = Actor::Player(player);
    let game = GameService::new(store.clone());
    let view = game.view(actor, u).await.unwrap();
    let origin = view.bodies[0].id;
    let target = view
        .destinations
        .iter()
        .find(|d| d.id != origin)
        .unwrap()
        .id;
    let worker = Uuid::new_v4().into();
    for (start, recall_at, processed_at, return_at) in [
        (1_000_000, 5_740_999, 9_000_000, 10_481_998),
        (11_000_000, 11_000_000, 11_000_000, 11_000_000),
    ] {
        store.set_test_time(start).await.unwrap();
        let ships = vec![ShipStack {
            owner: player,
            ship_type: ShipType::SmallCargo,
            count: 2,
        }];
        let cargo = Resources {
            metal: 100 * SCALE,
            crystal: 0,
            deuterium: 0,
        };
        let q = game
            .quote(
                actor,
                u,
                QuoteRequest::Transport {
                    origin,
                    target,
                    ships: ships.clone(),
                    cargo,
                    speed_percent: 100,
                },
            )
            .await
            .unwrap();
        let launch = CommandEnvelope {
            command_id: Uuid::new_v4().into(),
            epoch: view.epoch,
            protocol: 2,
            command: Command::LaunchTransport {
                origin,
                target,
                ships,
                cargo,
                speed_percent: 100,
                expected_terms_hash: q.terms_hash,
            },
        };
        game.submit(actor, u, launch).await.unwrap();
        game.step(u, worker).await.unwrap();
        let active = game.view(actor, u).await.unwrap();
        let fleet = FleetId(Uuid::parse_str(&active.fleets[0].id).unwrap());
        store.set_test_time(recall_at).await.unwrap();
        let recall = CommandEnvelope {
            command_id: Uuid::new_v4().into(),
            epoch: view.epoch,
            protocol: 2,
            command: Command::RecallFleet { fleet },
        };
        game.submit(actor, u, recall.clone()).await.unwrap();
        store.set_test_time(processed_at).await.unwrap();
        game.step(u, worker).await.unwrap();
        assert!(matches!(
            game.receipt(actor, u, recall.command_id)
                .await
                .unwrap()
                .status,
            ReceiptStatus::Committed { .. }
        ));
        if recall_at != start {
            let returning = game.view(actor, u).await.unwrap();
            assert_eq!(returning.fleets[0].due_at, return_at);
            store.set_test_time(return_at).await.unwrap();
            game.step(u, worker).await.unwrap();
        }
        let returned = game.view(actor, u).await.unwrap();
        assert!(returned.fleets.is_empty());
        assert_eq!(returned.bodies[0].inventories[0].count, "2");
        assert!(returned.reports.iter().all(|r| r.kind != "Delivered"));
    }
    // Both commands are admitted at the same time. Their two completion events tie.
    let beta = SessionService::new(store.clone())
        .login("beta", &pw[1], None)
        .await
        .unwrap();
    let beta_actor = Actor::Player(beta.session.memberships[0].player);
    let mut operations = Vec::new();
    for (who, body) in [(actor, origin), (beta_actor, target)] {
        let q = game
            .quote(
                who,
                u,
                QuoteRequest::Upgrade {
                    body,
                    building: orbit_engine::Building::MetalMine,
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
                building: orbit_engine::Building::MetalMine,
                expected_terms_hash: q.terms_hash,
            },
        };
        game.submit(who, u, envelope.clone()).await.unwrap();
        game.step(u, worker).await.unwrap();
        let ReceiptStatus::Committed { result_ids, .. } = game
            .receipt(who, u, envelope.command_id)
            .await
            .unwrap()
            .status
        else {
            panic!("upgrade rejected")
        };
        operations.push(result_ids[0].clone());
    }
    store.set_test_time(11_161_000).await.unwrap();
    for operation in operations {
        let claim = store.claim_next(u, worker).await.unwrap().unwrap();
        let orbit_engine::Input::Event(orbit_engine::ScheduledEvent::ConstructionDue {
            operation: actual,
            ..
        }) = &claim.input.payload
        else {
            panic!("wrong due event")
        };
        assert_eq!(actual.to_string(), operation);
        game.resolve_claim(claim).await.unwrap();
    }
}
