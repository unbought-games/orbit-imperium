use super::gameplay::{command, complete, drain};
use super::*;

#[tokio::test]
async fn terraformer_activation_restart_and_power_loss_preserve_capacity_in_both_runtimes() {
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
        let base_fields = snapshot.state.bodies[&body].fields;
        let service = RulesService::new(store.clone());
        let preview = service.prepare_upgrade(universe).await.unwrap();
        assert!(
            preview
                .diff
                .initialize
                .add_buildings
                .contains(&Building::Terraformer)
        );
        assert!(
            !store
                .load_rules(universe)
                .await
                .unwrap()
                .building_keys()
                .contains(&Building::Terraformer)
        );
        service.apply(&preview.document).await.unwrap();
        let (active, _) = store.bound_world(binding).await.unwrap().facts;
        assert_eq!(active.state.bodies[&body].levels[&Building::Terraformer], 0);
        assert_eq!(
            body_field_capacity(&active.state.bodies[&body], &active.rules).unwrap(),
            base_fields
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
            .bind(sqlx::types::Json(Resources::all(100_000_000 * SCALE)))
            .execute(&pool)
            .await
            .unwrap();
        for (building, level) in [
            (Building::RoboticsFactory, 10),
            (Building::ResearchLab, 1),
            (Building::Shipyard, 1),
        ] {
            for _ in 0..level {
                complete(&store, binding, QuoteRequest::Upgrade { body, building }).await;
            }
        }
        for (research, level) in [
            (ResearchId::ComputerTechnology, 10),
            (ResearchId::EnergyTechnology, 12),
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
        complete(
            &store,
            binding,
            QuoteRequest::Upgrade {
                body,
                building: Building::NaniteFactory,
            },
        )
        .await;
        // Build the real stationary power source so persisted inventory and energy
        // participate in both the serial and scoped construction facts.
        let (snapshot, _) = store.bound_world(binding).await.unwrap().facts;
        let q = QuoteRequest::Manufacture {
            body,
            item: ManufacturedItem::Ship(ShipType::SolarSatellite),
            quantity: 60,
        };
        let quote = inspect_progression(
            &snapshot.state,
            Actor::Player(binding.player),
            &q,
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
                item: ManufacturedItem::Ship(ShipType::SolarSatellite),
                quantity: 60,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (pending, _) = store.bound_world(binding).await.unwrap().facts;
        let batch = pending
            .state
            .manufacturing_batches
            .values()
            .find(|x| x.status == ManufacturingStatus::Active)
            .unwrap();
        store
            .set_test_time(
                batch.next_due_at
                    + (batch.quantity - batch.completed_prefix - 1) * batch.unit_duration_ms,
            )
            .await
            .unwrap();
        drain(&store, universe).await;
        let q = QuoteRequest::Upgrade {
            body,
            building: Building::Terraformer,
        };
        let (ready, _) = store.bound_world(binding).await.unwrap().facts;
        let quote = inspect_progression(
            &ready.state,
            Actor::Player(binding.player),
            &q,
            ready.at,
            &ready.rules,
        )
        .unwrap();
        assert!(quote.blockers.is_empty(), "{:?}", quote.blockers);
        command(
            &store,
            binding,
            Command::StartUpgrade {
                body,
                building: Building::Terraformer,
                expected_terms_hash: quote.terms_hash.unwrap(),
            },
        )
        .await;
        let (paid, _) = store.bound_world(binding).await.unwrap().facts;
        let op = paid
            .state
            .constructions
            .values()
            .find(|x| x.status == ConstructionStatus::Active)
            .unwrap()
            .clone();
        assert_eq!(reserved_fields(&paid.state, body).unwrap(), 1);
        assert_eq!(
            body_field_capacity(&paid.state.bodies[&body], &paid.rules).unwrap(),
            base_fields
        );
        // Lose all power after acceptance. No continuing energy reservation exists.
        let settings = &paid.state.production_settings[&body];
        command(
            &store,
            binding,
            Command::SetProduction {
                body,
                settings: ProductionSettings {
                    solar_satellite: 0,
                    ..settings.settings.clone()
                },
                expected_settings_revision: settings.revision,
            },
        )
        .await;
        let mut disabled = service.export(universe).await.unwrap();
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
        assert_eq!(recovered.state.constructions[&op.id], op);
        assert_eq!(
            body_economy(
                &recovered.state,
                &recovered.state.bodies[&body],
                &recovered.rules
            )
            .unwrap()
            .energy
            .supply,
            0
        );
        restarted.set_test_time(op.due_at).await.unwrap();
        drain(&restarted, universe).await;
        let (done, _) = restarted.bound_world(binding).await.unwrap().facts;
        assert_eq!(done.state.bodies[&body].fields, base_fields);
        assert_eq!(done.state.bodies[&body].levels[&Building::Terraformer], 1);
        assert_eq!(
            body_field_capacity(&done.state.bodies[&body], &done.rules).unwrap(),
            base_fields + 5
        );
        assert_eq!(reserved_fields(&done.state, body).unwrap(), 0);
        assert!(
            done.state
                .world
                .as_ref()
                .unwrap()
                .records
                .lots
                .iter()
                .any(|lot| lot.item == CatalogKey::Building(Building::Terraformer))
        );
        let principal = Principal {
            account: binding.account,
            player: binding.player,
            universe,
        };
        let view = GameService::new(restarted.clone())
            .world_view(
                principal,
                QueryContext {
                    request_id: Uuid::new_v4(),
                    binding,
                },
            )
            .await
            .unwrap();
        let projected = view
            .progression
            .bodies
            .iter()
            .find(|b| b.id == body)
            .unwrap();
        assert_eq!(projected.fields, base_fields + 5);
        assert_eq!(
            projected.fields_used,
            done.state.bodies[&body].levels.values().sum::<u32>()
        );
        assert!(
            inspect_progression(
                &done.state,
                Actor::Player(binding.player),
                &q,
                done.at,
                &done.rules
            )
            .unwrap()
            .blockers
            .iter()
            .any(|b| b.code == GameError::UnavailableContent)
        );
    }
}
