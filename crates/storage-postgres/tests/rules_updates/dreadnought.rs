use super::gameplay::{command, drain};
use super::*;
use serde_json::json;

#[tokio::test]
async fn activated_dreadnought_batch_survives_disable_and_restart() {
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(universe).await.unwrap();
        service.apply(&plan.document).await.unwrap();
        let username: String = sqlx::query_scalar("SELECT name FROM accounts WHERE id=$1")
            .bind(binding.account.0)
            .fetch_one(&pool)
            .await
            .unwrap();
        let scenario = serde_json::from_value(json!({"version":1,"edits":[{
            "op":"set","user":username,"all_planets":true,
            "buildings":{"shipyard":12},
            "research":{"hyperspacetechnology":6,"hyperspacedrive":7,"gravitontechnology":1},
            "resources":{"metal":10000000,"crystal":8000000,"deuterium":2000000}
        }]}))
        .unwrap();
        store
            .apply_world_scenario(universe, &scenario, ScenarioMode::Patch, Uuid::new_v4())
            .await
            .unwrap();
        if scoped {
            store.prepare_scoped_runtime(universe, 1).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let body = snapshot
            .state
            .bodies
            .values()
            .find(|b| b.owner == binding.player)
            .unwrap()
            .id;
        let item = ManufacturedItem::Ship(ShipType::Dreadnought);
        let request = QuoteRequest::Manufacture {
            body,
            item,
            quantity: 2,
        };
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &request,
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        command(
            &store,
            binding,
            Command::StartManufacture {
                body,
                item,
                quantity: 2,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (paid, _) = store.bound_world(binding).await.unwrap().facts;
        let batch = paid
            .state
            .manufacturing_batches
            .values()
            .find(|b| b.item == item)
            .unwrap();
        assert_eq!(
            batch.commitment.paid,
            Resources::from_values([10_000_000 * SCALE, 8_000_000 * SCALE, 2_000_000 * SCALE])
        );
        let mut disabled = service.export(universe).await.unwrap();
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == item.catalog_key())
            .unwrap()
            .enabled = false;
        service.apply(&disabled).await.unwrap();
        assert!(service.prepare_upgrade(universe).await.is_err());
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        restarted.set_test_time(batch.final_due_at).await.unwrap();
        drain(&restarted, universe).await;
        let (after, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            after
                .state
                .inventories
                .iter()
                .find(|u| u.body == body && u.item == item)
                .unwrap()
                .count,
            2
        );
        restarted.audit_universe(universe).await.unwrap();
    }
}
