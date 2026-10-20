use orbit_application::*;
use orbit_engine::{FleetId, Resources, SCALE, ShipStack, ShipType};
use orbit_storage_postgres::PgStore;
use uuid::Uuid;
#[tokio::test]
async fn delivery_return_recall_deadline_and_private_reports() {
    let store = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let u = Uuid::new_v4().into();
    let pw = [Uuid::new_v4().to_string(), Uuid::new_v4().to_string()];
    store.seed(u, 1_000_000, 1, &pw).await.unwrap();
    store.set_test_time(1_000_000).await.unwrap();
    let sessions = SessionService::new(store.clone());
    let alpha = sessions.login("alpha", &pw[0], None).await.unwrap();
    let beta = sessions.login("beta", &pw[1], None).await.unwrap();
    let a = alpha.session.memberships[0].player;
    let b = beta.session.memberships[0].player;
    let service = GameService::new(store.clone());
    let av = service.view(Actor::Player(a), u).await.unwrap();
    let bv = service.view(Actor::Player(b), u).await.unwrap();
    let origin = av.bodies[0].id;
    let target = bv.bodies[0].id;
    let worker = Uuid::new_v4().into();
    let ships = vec![ShipStack {
        owner: a,
        ship_type: ShipType::SmallCargo,
        count: 2,
    }];
    let cargo = Resources {
        metal: 100 * SCALE,
        crystal: 50 * SCALE,
        deuterium: 10 * SCALE,
    };
    let q = service
        .quote(
            Actor::Player(a),
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
    let envelope = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: av.epoch,
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
    service
        .submit(Actor::Player(a), u, envelope.clone())
        .await
        .unwrap();
    service.step(u, worker).await.unwrap();
    let launched = service.view(Actor::Player(a), u).await.unwrap();
    assert_eq!(launched.bodies[0].inventories[0].count, "0");
    assert_eq!(launched.fleets[0].paid_fuel, "3000000");
    let fleet = FleetId(Uuid::parse_str(&launched.fleets[0].id).unwrap());
    assert!(
        service
            .receipt(Actor::Player(b), u, envelope.command_id)
            .await
            .is_err()
    );
    // Arrival wins over recall admitted at the exact same deadline.
    store.set_test_time(5_741_000).await.unwrap();
    let recall = CommandEnvelope {
        command_id: Uuid::new_v4().into(),
        epoch: av.epoch,
        protocol: 2,
        command: Command::RecallFleet { fleet },
    };
    service
        .submit(Actor::Player(a), u, recall.clone())
        .await
        .unwrap();
    service.step(u, worker).await.unwrap();
    service.step(u, worker).await.unwrap();
    assert!(matches!(
        service
            .receipt(Actor::Player(a), u, recall.command_id)
            .await
            .unwrap()
            .status,
        ReceiptStatus::Rejected {
            code: GameError::NotOutbound
        }
    ));
    let recipient = service.view(Actor::Player(b), u).await.unwrap();
    assert_eq!(recipient.bodies[0].amounts.deuterium, "1010000000");
    assert_eq!(recipient.reports[0].cargo.deuterium, "10000000");
    assert!(recipient.fleets.is_empty());
    let sender = service.view(Actor::Player(a), u).await.unwrap();
    assert_eq!(sender.bodies.len(), 1);
    assert_eq!(sender.reports[0].kind, "Delivered");
    store.set_test_time(10_482_000).await.unwrap();
    service.step(u, worker).await.unwrap();
    assert_eq!(
        service.view(Actor::Player(a), u).await.unwrap().bodies[0].inventories[0].count,
        "2"
    );
    // Replay each recorded transition from its complete fact snapshot.
    let pool = sqlx::PgPool::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let rows = sqlx::query_as::<_, (serde_json::Value, serde_json::Value, serde_json::Value)>(
        "SELECT input,facts,outcome FROM transition_journal ORDER BY cursor",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rules = store.load_rules(u).await.unwrap();
    for (input, facts, expected) in rows {
        let input = serde_json::from_value(input).unwrap();
        let facts = serde_json::from_value(facts).unwrap();
        assert_eq!(
            serde_json::to_value(orbit_engine::transition(&facts, &input, &rules)).unwrap(),
            expected
        )
    }
}
