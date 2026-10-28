use super::gameplay::{command, complete, drain};
use super::*;

#[tokio::test]
async fn hyperspace_activates_researches_and_finishes_after_disable_and_restart_in_both_runtimes() {
    for scoped in [false, true] {
        let (store, pool, universe, binding) = setup().await;
        if scoped {
            store.prepare_scoped_runtime(universe, 1).await.unwrap();
            store.activate_scoped_runtime(universe).await.unwrap();
        }
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(universe).await.unwrap();
        assert!(
            plan.diff
                .initialize
                .add_research
                .contains(&ResearchId::HyperspaceTechnology)
        );
        assert!(
            plan.diff
                .initialize
                .add_research
                .contains(&ResearchId::HyperspaceDrive)
        );
        service.apply(&plan.document).await.unwrap();
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let body = snapshot
            .state
            .bodies
            .values()
            .find(|b| b.owner == binding.player)
            .unwrap()
            .id;
        assert_eq!(
            snapshot.state.research[&binding.player].levels[&ResearchId::HyperspaceTechnology],
            0
        );
        assert!(
            snapshot
                .rules
                .research_keys()
                .contains(&ResearchId::HyperspaceDrive)
        );
        // Fund the fixture, then complete the real prerequisite chain for audit lineage.
        sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
            .bind(body.0)
            .bind(sqlx::types::Json(Resources::all(1_000_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        for _ in 0..7 {
            complete(
                &store,
                binding,
                QuoteRequest::Upgrade {
                    body,
                    building: Building::ResearchLab,
                },
            )
            .await;
        }
        for research in [
            ResearchId::EnergyTechnology,
            ResearchId::ShieldingTechnology,
        ] {
            for _ in 0..5 {
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
        let view = GameService::new(store.clone())
            .world_view(
                Principal {
                    account: binding.account,
                    player: binding.player,
                    universe,
                },
                QueryContext {
                    binding,
                    request_id: Uuid::new_v4(),
                },
            )
            .await
            .unwrap();
        let data = view
            .progression
            .catalog
            .iter()
            .find(|e| e.entry.key == CatalogKey::Research(ResearchId::HyperspaceTechnology))
            .unwrap()
            .technical_data
            .as_ref()
            .unwrap();
        assert!(data.bonuses.is_empty());
        assert!(
            data.facts
                .iter()
                .any(|f| f.label == "Effect" && f.value.contains("No additional per-level"))
        );
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let request = QuoteRequest::Research {
            host: body,
            research: ResearchId::HyperspaceTechnology,
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
            Command::StartResearch {
                host: body,
                research: ResearchId::HyperspaceTechnology,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (paid, _) = store.bound_world(binding).await.unwrap().facts;
        let operation = paid
            .state
            .research_operations
            .values()
            .find(|r| r.research == ResearchId::HyperspaceTechnology)
            .unwrap()
            .clone();
        assert_eq!(
            operation.commitment.paid,
            Resources::from_values([0, 4000 * SCALE, 2000 * SCALE])
        );
        assert_eq!(
            operation.commitment.due_at - operation.commitment.started_at,
            180_000
        );
        let mut disabled = service.export(universe).await.unwrap();
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceTechnology))
            .unwrap()
            .enabled = false;
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Research(ResearchId::HyperspaceDrive))
            .unwrap()
            .enabled = false;
        disabled
            .artifact
            .catalog
            .iter_mut()
            .find(|e| e.key == CatalogKey::Ship(ShipType::Destroyer))
            .unwrap()
            .enabled = false;
        service.apply(&disabled).await.unwrap();
        assert!(service.prepare_upgrade(universe).await.is_err());
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        restarted
            .set_test_time(operation.commitment.due_at)
            .await
            .unwrap();
        drain(&restarted, universe).await;
        let (after, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(
            after.state.research[&binding.player].levels[&ResearchId::HyperspaceTechnology],
            1
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
        assert!(
            after
                .rules
                .research_keys()
                .contains(&ResearchId::HyperspaceDrive)
        );
        restarted.audit_universe(universe).await.unwrap();
    }
}
