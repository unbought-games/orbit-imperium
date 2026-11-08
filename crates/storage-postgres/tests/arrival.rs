//! Regressions: arrival status ownership, appearance validation and public display.
use orbit_application::*;
use orbit_engine::*;
use orbit_storage_postgres::PgStore;
use serde_json::json;
use uuid::Uuid;

fn principal(b: Binding) -> Principal {
    Principal {
        account: b.account,
        player: b.player,
        universe: b.universe,
    }
}
fn context(b: Binding) -> QueryContext {
    QueryContext {
        binding: b,
        request_id: Uuid::new_v4(),
    }
}
fn request(b: Binding, action: ArrivalAction) -> ArrivalRequest {
    ArrivalRequest {
        context: context(b),
        action,
    }
}

#[tokio::test]
async fn signups_choose_an_orbit_matched_look_that_other_players_see_once() {
    let url = std::env::var("TEST_DATABASE_URL").expect("use make _db-arrival");
    let store = PgStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.set_test_time(1000).await.unwrap();
    let u = UniverseId(Uuid::new_v4());
    let veteran = format!("veteran-{}", Uuid::new_v4());
    let rules = standard_signup_rules(UniverseProfile::signup(1, 100).unwrap(), 3).unwrap();
    let doc: WorldScenario = serde_json::from_value(json!({"version":1,"rules":rules,"edits":[
        {"op":"add-player","user":veteran,"password":"password","planet":"1:50:8"}
    ]}))
    .unwrap();
    store
        .apply_world_scenario(u, &doc, ScenarioMode::Create, Uuid::new_v4())
        .await
        .unwrap();
    let sessions = SessionService::new(store.clone());
    let auth = sessions
        .signup(
            &format!("arrival-{}", Uuid::new_v4()),
            "password",
            SignupPolicy {
                universe: u,
                max_players: 100,
            },
            None,
        )
        .await
        .unwrap();
    let b = store
        .current_binding(auth.session.account, u)
        .await
        .unwrap()
        .0;
    let veteran_auth = sessions.login(&veteran, "password", None).await.unwrap();
    let peer = store
        .current_binding(veteran_auth.session.account, u)
        .await
        .unwrap()
        .0;
    let game = GameService::new(store.clone());

    let peer_view = game
        .world_view(principal(peer), context(peer))
        .await
        .unwrap()
        .facts;
    assert!(
        !peer_view.arrival_pending,
        "scenario players never see the scene"
    );
    let view = game
        .world_view(principal(b), context(b))
        .await
        .unwrap()
        .facts;
    assert!(view.arrival_pending);
    assert!(view.joined_at_ms.is_some());
    assert!(view.body_appearances.is_empty());
    let home = view.homeworld_id.unwrap();
    let position = view
        .progression
        .bodies
        .iter()
        .find(|body| body.id == home)
        .unwrap()
        .coordinates
        .position;
    let band = appearance_band(position);
    let outside = if *band.start() == 1 { 15 } else { 1 };

    let rejected = game
        .arrival(
            principal(b),
            request(
                b,
                ArrivalAction::SetAppearance {
                    body: home,
                    slot: outside,
                },
            ),
        )
        .await;
    assert!(matches!(
        rejected,
        Err(ServiceError::GameRejected(GameError::InvalidInput))
    ));
    let peer_home = peer_view.homeworld_id.unwrap();
    let foreign = game
        .arrival(
            principal(b),
            request(
                b,
                ArrivalAction::SetAppearance {
                    body: peer_home,
                    slot: 5,
                },
            ),
        )
        .await;
    assert!(matches!(foreign, Err(ServiceError::NotFound)));

    let chosen = *band.end();
    for _ in 0..2 {
        let state = game
            .arrival(
                principal(b),
                request(
                    b,
                    ArrivalAction::SetAppearance {
                        body: home,
                        slot: chosen,
                    },
                ),
            )
            .await
            .unwrap();
        assert!(state.pending, "choosing a look does not complete arrival");
    }
    for _ in 0..2 {
        let state = game
            .arrival(principal(b), request(b, ArrivalAction::Complete))
            .await
            .unwrap();
        assert!(!state.pending);
    }
    let view = game
        .world_view(principal(b), context(b))
        .await
        .unwrap()
        .facts;
    assert!(!view.arrival_pending);
    assert_eq!(view.body_appearances.get(&home), Some(&chosen));

    let coordinates = view
        .progression
        .bodies
        .iter()
        .find(|body| body.id == home)
        .unwrap()
        .coordinates;
    let galaxy = game
        .world_query(
            principal(peer),
            WorldQuery {
                context: context(peer),
                query: WorldQueryKind::Galaxy {
                    galaxy: coordinates.galaxy,
                    system: coordinates.system,
                },
            },
        )
        .await
        .unwrap()
        .facts
        .data;
    assert_eq!(
        galaxy["body_appearances"][home.0.to_string()],
        json!(chosen)
    );
}
