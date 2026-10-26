use super::gameplay::{command, complete, drain};
use super::*;

#[tokio::test]
async fn fusion_activates_builds_consumes_fuel_and_restarts_in_both_runtimes() {
    for scoped in [false, true] {
        let (store, pool, u, binding) = setup().await;
        if scoped {
            store.prepare_scoped_runtime(u, 1).await.unwrap();
            store.activate_scoped_runtime(u).await.unwrap();
        }
        let service = RulesService::new(store.clone());
        let plan = service.prepare_upgrade(u).await.unwrap();
        assert_eq!(
            plan.diff.initialize.add_buildings,
            vec![Building::FusionReactor]
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
            snapshot.state.bodies[&body].levels[&Building::FusionReactor],
            0
        );
        assert!(
            service
                .prepare_upgrade(u)
                .await
                .unwrap()
                .diff
                .changes
                .is_empty()
        );
        // Fund the fixture, then establish prerequisite lineage through ordinary work.
        sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
            .bind(body.0)
            .bind(sqlx::types::Json(Resources::all(10_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        for _ in 0..5 {
            complete(
                &store,
                binding,
                QuoteRequest::Upgrade {
                    body,
                    building: Building::DeuteriumSynthesizer,
                },
            )
            .await;
        }
        complete(
            &store,
            binding,
            QuoteRequest::Upgrade {
                body,
                building: Building::ResearchLab,
            },
        )
        .await;
        for _ in 0..3 {
            complete(
                &store,
                binding,
                QuoteRequest::Research {
                    host: body,
                    research: ResearchId::EnergyTechnology,
                },
            )
            .await;
        }
        sqlx::query("UPDATE bodies SET amounts=$2,revision=revision+1 WHERE id=$1")
            .bind(body.0)
            .bind(sqlx::types::Json(Resources::from_values([
                2000 * SCALE,
                2000 * SCALE,
                200 * SCALE,
            ])))
            .execute(&pool)
            .await
            .unwrap();
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &QuoteRequest::Upgrade {
                body,
                building: Building::FusionReactor,
            },
            snapshot.at,
            &snapshot.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty());
        command(
            &store,
            binding,
            Command::StartUpgrade {
                body,
                building: Building::FusionReactor,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let due = snapshot
            .state
            .constructions
            .values()
            .find(|c| c.body == body)
            .unwrap()
            .due_at;
        store.set_test_time(due).await.unwrap();
        drain(&store, u).await;
        // Turn synthesis off to force deterministic depletion of the remaining fuel.
        command(
            &store,
            binding,
            Command::SetProduction {
                body,
                settings: ProductionSettings {
                    deuterium_synthesizer: 0,
                    ..ProductionSettings::default()
                },
                expected_settings_revision: 0,
            },
        )
        .await;
        let principal = Principal {
            account: binding.account,
            player: binding.player,
            universe: u,
        };
        let context = || QueryContext {
            binding,
            request_id: Uuid::new_v4(),
        };
        let game = GameService::new(store.clone());
        let view = game.world_view(principal, context()).await.unwrap();
        let production = &view.progression.progression.production[0];
        assert!(production.editable.iter().any(|s| s == "fusion_reactor"));
        assert_eq!(production.net_deuterium_per_hour.sign, "Negative");
        assert!(
            production
                .fusion_reactor
                .as_ref()
                .unwrap()
                .projection_limit
                .is_some()
        );
        assert_eq!(
            view.progression.bodies[0].levels[&Building::FusionReactor],
            1
        );
        store.set_test_time(due + 3_600_000).await.unwrap();
        let exhausted = game.world_view(principal, context()).await.unwrap();
        assert_eq!(exhausted.progression.bodies[0].amounts.deuterium, "0");
        assert_eq!(
            exhausted.progression.progression.production[0].fuel_utilization,
            "0"
        );
        assert_eq!(
            exhausted.progression.progression.production[0]
                .settings
                .fusion_reactor,
            100
        );
        // A speed activation must settle the fuel boundary before adopting new rates.
        let mut next = service.export(u).await.unwrap();
        next.speed = 3;
        service.apply(&next).await.unwrap();
        let restarted = PgStore::connect(&std::env::var("TEST_DATABASE_URL").unwrap())
            .await
            .unwrap();
        let after = GameService::new(restarted)
            .world_view(principal, context())
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(&after.progression.bodies[0].amounts).unwrap(),
            serde_json::to_value(&exhausted.progression.bodies[0].amounts).unwrap()
        );
        assert_eq!(
            after.progression.progression.production[0].fuel_utilization,
            "0"
        );
    }
}
