use super::gameplay::complete;
use super::*;
#[tokio::test]
async fn depot_activation_initializes_retained_world_and_construction_survives_restart() {
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
        if scoped {
            store.prepare_scoped_runtime(universe, 1).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let before = store.bound_world(binding).await.unwrap().facts.0;
        let body = before
            .state
            .bodies
            .values()
            .find(|b| b.owner == binding.player)
            .unwrap()
            .id;
        assert!(!holding_enabled(&before.rules));
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(universe).await.unwrap();
        assert!(
            plan.diff
                .initialize
                .add_buildings
                .contains(&Building::AllianceDepot)
        );
        assert!(!holding_enabled(&store.load_rules(universe).await.unwrap()));
        service.apply(&plan.document).await.unwrap();
        let after = store.bound_world(binding).await.unwrap().facts.0;
        assert!(holding_enabled(&after.rules));
        assert_eq!(
            after.state.bodies[&body].levels[&Building::AllianceDepot],
            0
        );
        assert!(
            service
                .prepare_upgrade(universe)
                .await
                .unwrap()
                .diff
                .changes
                .is_empty()
        );
        sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
            .bind(body.0)
            .bind(sqlx::types::Json(Resources::all(1_000_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        complete(
            &store,
            binding,
            QuoteRequest::Upgrade {
                body,
                building: Building::AllianceDepot,
            },
        )
        .await;
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        let built = restarted.bound_world(binding).await.unwrap().facts.0;
        assert_eq!(
            built.state.bodies[&body].levels[&Building::AllianceDepot],
            1
        );
        assert_eq!(
            depot_budget(
                1,
                body,
                built.at,
                &built.state.world.as_ref().unwrap().records.depot_supplies
            )
            .unwrap()
            .0,
            10_000 * SCALE
        );
        complete(
            &restarted,
            binding,
            QuoteRequest::Demolition {
                body,
                building: Building::AllianceDepot,
            },
        )
        .await;
        assert_eq!(
            restarted
                .bound_world(binding)
                .await
                .unwrap()
                .facts
                .0
                .state
                .bodies[&body]
                .levels[&Building::AllianceDepot],
            0
        );
    }
}
