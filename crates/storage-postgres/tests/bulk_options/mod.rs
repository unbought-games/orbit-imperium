use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;

/// Both protocol stores must load one complete player scope for a mixed catalog.
pub async fn check(game: &GameService<PgStore>, p: Principal, c: QueryContext, body: BodyId) {
    let requests = [
        QuoteRequest::Upgrade {
            body,
            building: Building::MetalMine,
        },
        QuoteRequest::Upgrade {
            body,
            building: Building::CrystalMine,
        },
        QuoteRequest::Demolition {
            body,
            building: Building::MetalMine,
        },
        QuoteRequest::Research {
            host: body,
            research: ResearchId::EnergyTechnology,
        },
        QuoteRequest::Manufacture {
            body,
            item: ManufacturedItem::Ship(ShipType::SmallCargo),
            quantity: 1,
        },
        QuoteRequest::Manufacture {
            body,
            item: ManufacturedItem::Defense(DefenseId::RocketLauncher),
            quantity: 1,
        },
    ];
    let query = || ProgressionOptionsBatchQuery {
        context: c.clone(),
        requests: requests
            .iter()
            .cloned()
            .map(QuoteRequestDto3::Progression)
            .collect(),
    };
    let result = game.progression_options_batch(p, query()).await.unwrap();
    assert_eq!(result.options.len(), requests.len());
    for (request, option) in requests.iter().zip(&result.options) {
        let single = game
            .progression_options(p, c.clone(), QuoteRequestDto3::Progression(request.clone()))
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(option).unwrap(),
            serde_json::to_value(&single.facts).unwrap()
        );
        assert_eq!(option.request_id, c.request_id);
        assert_eq!(option.viewer_revision, result.options[0].viewer_revision);
        assert_eq!(option.as_of_ms, result.options[0].as_of_ms);
    }
    assert!(
        result
            .options
            .iter()
            .any(|o| !o.inspection.blockers.is_empty()),
        "blocked entries remain inspectable in a batch"
    );
    for length in [0, 129] {
        let mut q = query();
        q.requests = vec![q.requests[0].clone(); length];
        assert!(matches!(
            game.progression_options_batch(p, q).await,
            Err(ServiceError::Malformed)
        ));
    }
    let mut q = query();
    q.requests
        .push(QuoteRequestDto3::Progression(QuoteRequest::Upgrade {
            body: BodyId(uuid::Uuid::new_v4()),
            building: Building::MetalMine,
        }));
    assert!(matches!(
        game.progression_options_batch(p, q).await,
        Err(ServiceError::NotFound)
    ));
    let mut q = query();
    q.context.binding.player = PlayerId(uuid::Uuid::new_v4());
    assert!(game.progression_options_batch(p, q).await.is_err());
}
