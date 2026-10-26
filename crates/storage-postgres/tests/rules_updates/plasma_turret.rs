use super::gameplay::{command, complete, drain};
use super::*;

#[tokio::test]
async fn plasma_turrets_activate_build_and_finish_after_disable_and_restart_in_both_runtimes() {
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
        if scoped {
            store.prepare_scoped_runtime(universe, 1).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(universe).await.unwrap();
        service.apply(&plan.document).await.unwrap();
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let body = snapshot
            .state
            .bodies
            .values()
            .find(|b| b.owner == binding.player)
            .unwrap()
            .id;
        let item = ManufacturedItem::Defense(DefenseId::PlasmaTurret);
        assert!(!snapshot.state.inventories.iter().any(|u| u.item == item));
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
            .bind(sqlx::types::Json(Resources::all(100_000_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        // Complete the actual prerequisite chain so lineage/audit are meaningful.
        for (building, level) in [
            (Building::RoboticsFactory, 2),
            (Building::Shipyard, 8),
            (Building::ResearchLab, 4),
        ] {
            for _ in 0..level {
                complete(&store, binding, QuoteRequest::Upgrade { body, building }).await;
            }
        }
        for (research, level) in [
            (ResearchId::EnergyTechnology, 8),
            (ResearchId::LaserTechnology, 10),
            (ResearchId::IonTechnology, 5),
            (ResearchId::PlasmaTechnology, 7),
        ] {
            for _ in 0..level {
                complete(
                    &store,
                    binding,
                    QuoteRequest::Research {
                        host: body,
                        research,
                    },
                )
                .await;
            }
        }
        let principal = Principal {
            account: binding.account,
            player: binding.player,
            universe,
        };
        let view = GameService::new(store.clone())
            .world_view(
                principal,
                QueryContext {
                    binding,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let entry = view
            .progression
            .catalog
            .iter()
            .find(|e| e.entry.key == item.catalog_key())
            .unwrap();
        let stats = entry
            .technical_data
            .as_ref()
            .unwrap()
            .combat
            .as_ref()
            .unwrap();
        assert_eq!(
            (
                stats.attack_ticks.as_str(),
                stats.shield_ticks.as_str(),
                stats.hull_ticks.as_str()
            ),
            ("300000000", "30000000", "1000000000")
        );
        assert!(stats.rapid_fire_against.is_empty() && stats.rapid_fire_from.is_empty());
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
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
        assert!(quote.blockers.is_empty());
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
            .unwrap()
            .clone();
        assert_eq!(
            batch.commitment.paid,
            Resources::from_values([100000 * SCALE, 100000 * SCALE, 60000 * SCALE])
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
        assert_eq!(
            after.state.manufacturing_batches[&batch.id].status,
            ManufacturingStatus::Completed
        );
        assert_eq!(
            after.state.manufacturing_batches[&batch.id].commitment,
            batch.commitment
        );
        let quote = inspect_progression(
            &after.state,
            Actor::Player(binding.player),
            &request,
            after.at,
            &after.rules,
        )
        .unwrap();
        assert!(
            quote
                .blockers
                .iter()
                .any(|b| b.code == GameError::UnavailableContent)
        );
        restarted.audit_universe(universe).await.unwrap();
        drain(&restarted, universe).await;
        let (again, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(again.state.inventories, after.state.inventories);
    }
}
