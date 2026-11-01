use super::gameplay::{command, complete, drain};
use super::*;

#[tokio::test]
async fn nanite_activation_preserves_batches_and_builds_with_durable_acceleration_in_both_runtimes()
{
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
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
        sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
            .bind(body.0)
            .bind(sqlx::types::Json(Resources::all(20_000_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        // Complete the real gates to preserve valuation and prerequisite lineage.
        for (building, level) in [
            (Building::RoboticsFactory, 10),
            (Building::ResearchLab, 1),
            (Building::Shipyard, 1),
        ] {
            for _ in 0..level {
                complete(&store, binding, QuoteRequest::Upgrade { body, building }).await;
            }
        }
        for _ in 0..10 {
            complete(
                &store,
                binding,
                QuoteRequest::Research {
                    host: body,
                    research: ResearchId::ComputerTechnology,
                },
            )
            .await;
        }
        let item = ManufacturedItem::Defense(DefenseId::RocketLauncher);
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let before_duration =
            manufacture_terms(&snapshot.state.bodies[&body], item, 2, &snapshot.rules)
                .unwrap()
                .duration();
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &QuoteRequest::Manufacture {
                body,
                item,
                quantity: 2,
            },
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
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
        let (before, _) = store.bound_world(binding).await.unwrap().facts;
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(universe).await.unwrap();
        assert!(
            plan.diff
                .initialize
                .add_buildings
                .contains(&Building::NaniteFactory)
        );
        assert!(
            !store
                .load_rules(universe)
                .await
                .unwrap()
                .building_keys()
                .contains(&Building::NaniteFactory)
        );
        service.apply(&plan.document).await.unwrap();
        let (after, _) = store.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            after.state.bodies[&body].levels[&Building::NaniteFactory],
            0
        );
        assert_eq!(
            after.state.manufacturing_batches,
            before.state.manufacturing_batches
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
        let q = QuoteRequest::Upgrade {
            body,
            building: Building::NaniteFactory,
        };
        let blocked = inspect_progression(
            &after.state,
            Actor::Player(binding.player),
            &q,
            after.at,
            &after.rules,
        )
        .unwrap();
        assert!(
            blocked
                .blockers
                .iter()
                .any(|b| b.code == GameError::YardLocked)
        );
        let due = after
            .state
            .manufacturing_batches
            .values()
            .map(|b| b.next_due_at + (b.quantity - b.completed_prefix - 1) * b.unit_duration_ms)
            .max()
            .unwrap();
        store.set_test_time(due).await.unwrap();
        drain(&store, universe).await;
        complete(&store, binding, q.clone()).await;
        let (built, _) = store.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            built.state.bodies[&body].levels[&Building::NaniteFactory],
            1
        );
        assert_eq!(
            manufacture_terms(&built.state.bodies[&body], item, 2, &built.rules)
                .unwrap()
                .duration(),
            before_duration / 2
        );
        assert!(
            built
                .state
                .world
                .as_ref()
                .unwrap()
                .records
                .lots
                .iter()
                .any(|lot| lot.item == CatalogKey::Building(Building::NaniteFactory))
        );
        // A second upgrade pins the old level; disable new work while it is paid.
        let quote = inspect_progression(
            &built.state,
            Actor::Player(binding.player),
            &q,
            built.at,
            &built.rules,
        )
        .unwrap();
        command(
            &store,
            binding,
            Command::StartUpgrade {
                body,
                building: Building::NaniteFactory,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (pending, _) = store.bound_world(binding).await.unwrap().facts;
        let operation = pending
            .state
            .constructions
            .values()
            .find(|c| c.status == ConstructionStatus::Active)
            .unwrap()
            .clone();
        let mut disabled = service.export(universe).await.unwrap();
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(Building::NaniteFactory))
            .unwrap()
            .enabled = false;
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Building(Building::Terraformer))
            .unwrap()
            .enabled = false;
        service.apply(&disabled).await.unwrap();
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        let (recovered, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(recovered.state.constructions[&operation.id], operation);
        restarted.set_test_time(operation.due_at).await.unwrap();
        drain(&restarted, universe).await;
        let (completed, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            completed.state.bodies[&body].levels[&Building::NaniteFactory],
            2
        );
        assert_eq!(
            manufacture_terms(&completed.state.bodies[&body], item, 2, &completed.rules)
                .unwrap()
                .duration(),
            before_duration / 4
        );
        let inspection = inspect_progression(
            &completed.state,
            Actor::Player(binding.player),
            &q,
            completed.at,
            &completed.rules,
        )
        .unwrap();
        assert!(
            inspection
                .blockers
                .iter()
                .any(|b| b.code == GameError::UnavailableContent)
        );
    }
}
